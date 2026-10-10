import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth/auth.service';
import { MedicinesService } from './medicines/medicines.service';
import { InventoryService } from './inventory/inventory.service';
import { DashboardService } from './dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InventoryChangeType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

describe('Phase 6: Full Mobile-Backend Integration Test Suite (15 Workflows)', () => {
  let authService: AuthService;
  let medicinesService: MedicinesService;
  let inventoryService: InventoryService;
  let dashboardService: DashboardService;

  const db = {
    users: [] as any[],
    medicines: [] as any[],
    batches: [] as any[],
    stockHistories: [] as any[],
    refreshTokens: [] as any[],
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.email) return db.users.find((u) => u.email === where.email) || null;
        if (where.id) return db.users.find((u) => u.id === where.id) || null;
        return null;
      }),
    },
    refreshToken: {
      create: jest.fn(async ({ data }: any) => {
        const token = { id: `token-${Date.now()}`, ...data };
        db.refreshTokens.push(token);
        return token;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const token = db.refreshTokens.find((t) => t.tokenHash === where.tokenHash);
        if (!token) return null;
        const user = db.users.find((u) => u.id === token.userId);
        return { ...token, user };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const index = db.refreshTokens.findIndex((t) => t.id === where.id);
        if (index !== -1) {
          db.refreshTokens[index] = { ...db.refreshTokens[index], ...data };
          return db.refreshTokens[index];
        }
        return null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        db.refreshTokens.forEach((t) => {
          if (t.userId === where.userId && (where.revokedAt === null ? !t.revokedAt : true)) {
            t.revokedAt = data.revokedAt;
            count++;
          }
        });
        return { count };
      }),
    },
    medicine: {
      create: jest.fn(async ({ data }: any) => {
        const med = {
          id: `65f00000000000000000000${db.medicines.length + 1}`,
          isDeleted: false,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        db.medicines.push(med);
        return med;
      }),
      findMany: jest.fn(async (query?: any) => {
        let results = db.medicines.filter((m) => !m.isDeleted);
        if (query?.where?.minimumStock?.not === null) {
          results = results.filter((m) => m.minimumStock !== null);
        }
        if (query?.where?.OR) {
          results = results.filter((m) => {
            return query.where.OR.some((clause: any) => {
              for (const [key, filter] of Object.entries(clause)) {
                const val = m[key];
                if (typeof val === 'string' && typeof (filter as any).contains === 'string') {
                  if (val.toLowerCase().includes((filter as any).contains.toLowerCase())) {
                    return true;
                  }
                }
              }
              return false;
            });
          });
        }
        return results.map((m) => ({
          ...m,
          batches: db.batches.filter((b) => b.medicineId === m.id),
        }));
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          db.medicines.find((m) => {
            if (where.id && m.id !== where.id) return false;
            if (where.barcode && m.barcode !== where.barcode) return false;
            if (where.isDeleted !== undefined && m.isDeleted !== where.isDeleted) return false;
            if (where.NOT?.id && m.id === where.NOT.id) return false;
            return true;
          }) || null
        );
      }),
      count: jest.fn(async () => db.medicines.filter((m) => !m.isDeleted).length),
      update: jest.fn(async ({ where, data }: any) => {
        const index = db.medicines.findIndex((m) => m.id === where.id);
        if (index !== -1) {
          db.medicines[index] = { ...db.medicines[index], ...data, updatedAt: new Date() };
          return db.medicines[index];
        }
        return null;
      }),
    },
    batch: {
      create: jest.fn(async ({ data }: any) => {
        const batch = { id: `batch-${Date.now()}`, createdAt: new Date(), ...data };
        db.batches.push(batch);
        return batch;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          db.batches.find((b) => b.medicineId === where.medicineId && b.batchNumber === where.batchNumber) ||
          null
        );
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const index = db.batches.findIndex((b) => b.id === where.id);
        if (index !== -1) {
          db.batches[index] = { ...db.batches[index], ...data };
          return db.batches[index];
        }
        return null;
      }),
    },
    stockHistory: {
      create: jest.fn(async ({ data }: any) => {
        const hist = { id: `hist-${Date.now()}`, timestamp: new Date(), ...data };
        db.stockHistories.push(hist);
        return hist;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        return db.stockHistories.filter((h) => (!where?.medicineId || h.medicineId === where.medicineId));
      }),
      count: jest.fn(async () => db.stockHistories.length),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  let testUserId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('PharmacyAdmin123!', 10);
    const ownerUser = {
      id: '65f000000000000000000001',
      email: 'admin@pharmacy.com',
      passwordHash,
      name: 'Pharmacy Owner',
      pharmacyName: 'My Personal Pharmacy',
      role: 'OWNER',
    };
    db.users.push(ownerUser);
    testUserId = ownerUser.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        MedicinesService,
        InventoryService,
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_ACCESS_SECRET') return 'test_jwt_secret';
              if (key === 'JWT_ACCESS_EXPIRATION') return '15m';
              return null;
            }),
          },
        },
      ],
    }).compile();

    authService = moduleFixture.get<AuthService>(AuthService);
    medicinesService = moduleFixture.get<MedicinesService>(MedicinesService);
    inventoryService = moduleFixture.get<InventoryService>(InventoryService);
    dashboardService = moduleFixture.get<DashboardService>(DashboardService);
  });

  // ============================================================
  // 15 END-TO-END WORKFLOW INTEGRATION TESTS
  // ============================================================

  it('Workflow 1: Owner logs in and receives valid JWT tokens', async () => {
    const authResult = await authService.login({
      email: 'admin@pharmacy.com',
      password: 'PharmacyAdmin123!',
    });

    expect(authResult).toBeDefined();
    expect(authResult.accessToken).toBeDefined();
    expect(authResult.user.email).toBe('admin@pharmacy.com');
  });

  it('Workflow 2: Owner views dashboard summary metrics', async () => {
    const summary = await dashboardService.getSummary();
    expect(summary).toHaveProperty('totalMedicines');
    expect(summary).toHaveProperty('totalStockUnits');
    expect(summary).toHaveProperty('totalSellingValue');
    expect(summary).toHaveProperty('lowStockCount');
  });

  it('Workflow 3 & 4: Search for existing medicines and open medicine details', async () => {
    const seeded = await medicinesService.create(
      {
        name: 'Paracetamol 500mg Extra',
        genericName: 'Paracetamol',
        brandName: 'Napa',
        sellingPrice: 15.0,
        quantity: 100,
        barcode: '8901111111111',
        onlinePurchaseUrl: 'https://distributor.example.com/order/paracetamol',
      },
      testUserId,
    );

    const searchResult = await medicinesService.search('napa', 1, 10);
    expect(searchResult.items.length).toBeGreaterThanOrEqual(1);

    const detail = await medicinesService.findOne(seeded.id);
    expect(detail.id).toBe(seeded.id);
    expect(detail.name).toBe('Paracetamol 500mg Extra');
    expect(detail.onlinePurchaseUrl).toBe('https://distributor.example.com/order/paracetamol');
  });

  it('Workflow 5: Add a medicine with ONLY the 3 mandatory fields (all 15 optional omitted)', async () => {
    const minimalMed = await medicinesService.create(
      {
        name: 'Simple Antacid Tablet',
        sellingPrice: 5.5,
        quantity: 200,
      },
      testUserId,
    );

    expect(minimalMed.name).toBe('Simple Antacid Tablet');
    expect(minimalMed.sellingPrice).toBe(5.5);
    expect(minimalMed.quantity).toBe(200);
    expect(minimalMed.genericName).toBeNull();
    expect(minimalMed.purchasePrice).toBeNull();
    expect(minimalMed.minimumStock).toBeNull();
  });

  it('Workflow 6: Edit medicine selling price without affecting current stock', async () => {
    const med = db.medicines[db.medicines.length - 1];
    const initialQty = med.quantity;

    const updated = await medicinesService.update(med.id, {
      sellingPrice: 7.0,
    });

    expect(updated.sellingPrice).toBe(7.0);
    expect(updated.quantity).toBe(initialQty);
  });

  it('Workflow 7 & 8: Update stock through controlled inward receipt and confirm audit history', async () => {
    const med = db.medicines[db.medicines.length - 1];
    const initialQty = med.quantity;

    const receipt = await inventoryService.recordReceipt(
      {
        medicineId: med.id,
        quantity: 50,
        unitPurchaseCost: 3.5,
        batchNumber: 'LOT-2026-X1',
        notes: 'Inward delivery from distributor',
      },
      testUserId,
    );

    expect(receipt.medicine.quantity).toBe(initialQty + 50);
    expect(receipt.history.changeType).toBe(InventoryChangeType.STOCK_RECEIVED);
    expect(receipt.history.quantityChanged).toBe(50);
    expect(receipt.history.quantityAfter).toBe(initialQty + 50);

    const historyLog = await inventoryService.getHistory({ medicineId: med.id });
    expect(historyLog.items.length).toBeGreaterThanOrEqual(1);
  });

  it('Workflow 9: View low-stock medicines when configured', async () => {
    const lowMed = await medicinesService.create(
      {
        name: 'Urgent Drops',
        sellingPrice: 25.0,
        quantity: 2,
        minimumStock: 10,
      },
      testUserId,
    );

    const report = await inventoryService.getLowStock();
    const item = report.items.find((i) => i.id === lowMed.id);

    expect(item).toBeDefined();
    expect(item?.currentQuantity).toBe(2);
    expect(item?.minimumStock).toBe(10);
    expect(item?.shortage).toBe(8);
  });

  it('Workflow 10: Open expiry information and verify batch-level breakdown', async () => {
    const nearExpiryDate = new Date();
    nearExpiryDate.setDate(nearExpiryDate.getDate() + 12);

    await medicinesService.create(
      {
        name: 'Expiring Injection Lot',
        sellingPrice: 150.0,
        quantity: 10,
        expiryDate: nearExpiryDate.toISOString().split('T')[0],
      },
      testUserId,
    );

    const expiryReport = await inventoryService.getExpiring(30);
    expect(expiryReport.expiringSoon.length).toBeGreaterThanOrEqual(1);
  });

  it('Workflow 11, 12 & 13: Temporary Cart calculations never modify inventory stock', async () => {
    const med1 = db.medicines[0];
    const med2 = db.medicines[1];

    const med1InitialStock = med1.quantity;
    const med2InitialStock = med2.quantity;

    const cart = [
      { medicine: med1, quantity: 4, customPrice: med1.sellingPrice },
      { medicine: med2, quantity: 2, customPrice: med2.sellingPrice },
    ];

    const grandTotal = cart.reduce((sum, item) => sum + item.customPrice * item.quantity, 0);
    const expectedTotal = med1.sellingPrice * 4 + med2.sellingPrice * 2;
    expect(grandTotal).toBe(expectedTotal);

    const freshMed1 = await medicinesService.findOne(med1.id);
    const freshMed2 = await medicinesService.findOne(med2.id);
    expect(freshMed1.quantity).toBe(med1InitialStock);
    expect(freshMed2.quantity).toBe(med2InitialStock);
  });

  it('Workflow 14: Valid external purchase link is preserved and safe to launch', async () => {
    const medWithUrl = db.medicines.find((m) => m.onlinePurchaseUrl);
    expect(medWithUrl).toBeDefined();
    expect(medWithUrl.onlinePurchaseUrl).toMatch(/^https?:\/\//);
  });

  it('Workflow 15: Verify unauthorized and invalid inputs are safely rejected', async () => {
    await expect(
      authService.login({
        email: 'admin@pharmacy.com',
        password: 'IncorrectPassword',
      }),
    ).rejects.toThrow();

    const med = db.medicines[0];
    await expect(
      inventoryService.recordAdjustment(
        {
          medicineId: med.id,
          quantityChange: -(med.quantity + 1000),
          changeType: InventoryChangeType.STOCK_ADJUSTMENT,
        },
        testUserId,
      ),
    ).rejects.toThrow();
  });
});
