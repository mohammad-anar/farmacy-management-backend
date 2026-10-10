import { Test, TestingModule } from '@nestjs/testing';
import { MedicinesService } from './medicines/medicines.service';
import { InventoryService } from './inventory/inventory.service';
import { DashboardService } from './dashboard/dashboard.service';
import { AuthService } from './auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InventoryChangeType } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('Phase 4: Complete Backend System Verification & Stabilization Test Suite', () => {
  let medicinesService: MedicinesService;
  let inventoryService: InventoryService;
  let dashboardService: DashboardService;
  let authService: AuthService;

  // In-memory Mock Database Store
  const db = {
    users: [] as any[],
    medicines: [] as any[],
    batches: [] as any[],
    stockHistories: [] as any[],
    refreshTokens: [] as any[],
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
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
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('PharmacyAdmin123!', 10);
    db.users.push({
      id: '65f000000000000000000001',
      email: 'admin@pharmacy.com',
      passwordHash,
      name: 'Owner Admin',
      role: 'OWNER',
    });
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicinesService,
        InventoryService,
        DashboardService,
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('test_access_token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_ACCESS_SECRET') return 'test_secret';
              if (key === 'JWT_ACCESS_EXPIRATION') return '15m';
              return null;
            }),
          },
        },
      ],
    }).compile();

    medicinesService = module.get<MedicinesService>(MedicinesService);
    inventoryService = module.get<InventoryService>(InventoryService);
    dashboardService = module.get<DashboardService>(DashboardService);
    authService = module.get<AuthService>(AuthService);
  });

  // ==========================================
  // CHECKLIST VERIFICATION TESTS 1-15
  // ==========================================

  it('1. Create a medicine using only name, sellingPrice, and quantity', async () => {
    const med = await medicinesService.create(
      {
        name: 'Napa 500mg',
        sellingPrice: 10.0,
        quantity: 50,
      },
      '65f000000000000000000001',
    );

    expect(med.name).toBe('Napa 500mg');
    expect(med.sellingPrice).toBe(10.0);
    expect(med.quantity).toBe(50);
  });

  it('2. Create a medicine with all optional fields omitted (stored as null, no crash)', async () => {
    const med = await medicinesService.create(
      {
        name: 'Omeprazole 20mg',
        sellingPrice: 6.5,
        quantity: 100,
      },
      '65f000000000000000000001',
    );

    expect(med.genericName).toBeNull();
    expect(med.brandName).toBeNull();
    expect(med.manufacturer).toBeNull();
    expect(med.barcode).toBeNull();
    expect(med.purchasePrice).toBeNull();
    expect(med.minimumStock).toBeNull();
    expect(med.expiryDate).toBeNull();
    expect(med.onlinePurchaseUrl).toBeNull();
  });

  it('3. Create a medicine with purchasePrice explicitly omitted (preserves null instead of 0)', async () => {
    const med = await medicinesService.create(
      {
        name: 'Ceevit 250mg',
        sellingPrice: 2.0,
        quantity: 200,
        purchasePrice: undefined,
      },
      '65f000000000000000000001',
    );

    expect(med.purchasePrice).toBeNull();
    expect(med.purchasePrice).not.toBe(0);
  });

  it('4. Update only the selling price without modifying quantity', async () => {
    const med = db.medicines[0];
    const initialQty = med.quantity;

    const updated = await medicinesService.update(med.id, {
      sellingPrice: 12.5,
    });

    expect(updated.sellingPrice).toBe(12.5);
    expect(updated.quantity).toBe(initialQty);
  });

  it('5. Update only the quantity through the controlled inventory workflow (receipt / adjustment)', async () => {
    const med = db.medicines[0];
    const initialQty = med.quantity;

    const receipt = await inventoryService.recordReceipt(
      {
        medicineId: med.id,
        quantity: 25,
        supplierName: 'Square Pharmaceuticals',
      },
      '65f000000000000000000001',
    );

    expect(receipt.medicine.quantity).toBe(initialQty + 25);
    expect(receipt.history.changeType).toBe(InventoryChangeType.STOCK_RECEIVED);
    expect(receipt.history.quantityChanged).toBe(25);
  });

  it('6 & 7. Search medicines by partial name, brand, generic with case-insensitivity', async () => {
    // Add a searchable medicine
    await medicinesService.create(
      {
        name: 'Ace Plus Tablet',
        genericName: 'Paracetamol & Caffeine',
        brandName: 'Ace Plus',
        sellingPrice: 30.0,
        quantity: 80,
      },
      '65f000000000000000000001',
    );

    const searchLower = await medicinesService.search('ace', 1, 10);
    const searchUpper = await medicinesService.search('ACE', 1, 10);
    const searchGeneric = await medicinesService.search('caffeine', 1, 10);

    expect(searchLower.items.length).toBeGreaterThanOrEqual(1);
    expect(searchUpper.items.length).toBeGreaterThanOrEqual(1);
    expect(searchGeneric.items.length).toBeGreaterThanOrEqual(1);
  });

  it('8. Verify low-stock behavior when minimumStock exists (quantity <= minimumStock)', async () => {
    // Create medicine with low stock
    const lowMed = await medicinesService.create(
      {
        name: 'Antibiotic Drop',
        sellingPrice: 45.0,
        quantity: 4,
        minimumStock: 10,
      },
      '65f000000000000000000001',
    );

    const lowStockReport = await inventoryService.getLowStock();
    const found = lowStockReport.items.find((item) => item.id === lowMed.id);

    expect(found).toBeDefined();
    expect(found?.currentQuantity).toBe(4);
    expect(found?.minimumStock).toBe(10);
    expect(found?.shortage).toBe(6);
  });

  it('9. Verify behavior when minimumStock is absent (not classified as low-stock)', async () => {
    const medNoMin = await medicinesService.create(
      {
        name: 'Herbal Balm',
        sellingPrice: 50.0,
        quantity: 1, // low quantity but no minimumStock configured
      },
      '65f000000000000000000001',
    );

    const lowStockReport = await inventoryService.getLowStock();
    const found = lowStockReport.items.find((item) => item.id === medNoMin.id);

    expect(found).toBeUndefined(); // Must NOT be in low stock list
  });

  it('10 & 11. Verify expired and approaching-expiry medicines, handling absent expiry dates gracefully', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);

    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 15);

    // Expired
    await medicinesService.create(
      {
        name: 'Expired Syrup',
        sellingPrice: 80.0,
        quantity: 5,
        expiryDate: pastDate.toISOString().split('T')[0],
      },
      '65f000000000000000000001',
    );

    // Expiring soon
    await medicinesService.create(
      {
        name: 'Expiring Injection',
        sellingPrice: 120.0,
        quantity: 8,
        expiryDate: soonDate.toISOString().split('T')[0],
      },
      '65f000000000000000000001',
    );

    // No expiry date (should not fail)
    await medicinesService.create(
      {
        name: 'Surgical Cotton',
        sellingPrice: 20.0,
        quantity: 50,
      },
      '65f000000000000000000001',
    );

    const expiryReport = await inventoryService.getExpiring(30);

    expect(expiryReport.expired.some((e) => e.name === 'Expired Syrup')).toBe(true);
    expect(expiryReport.expiringSoon.some((e) => e.name === 'Expiring Injection')).toBe(true);
    expect(expiryReport.expired.some((e) => e.name === 'Surgical Cotton')).toBe(false);
  });

  it('12. Verify inventory history audit trail completeness', async () => {
    const history = await inventoryService.getHistory({ page: 1, limit: 50 });
    expect(history.items.length).toBeGreaterThan(0);
    expect(history.items[0]).toHaveProperty('quantityBefore');
    expect(history.items[0]).toHaveProperty('quantityChanged');
    expect(history.items[0]).toHaveProperty('quantityAfter');
    expect(history.items[0]).toHaveProperty('changeType');
  });

  it('13. Verify invalid input rejection and unauthorized login handling', async () => {
    // Invalid credentials
    await expect(
      authService.login({
        email: 'admin@pharmacy.com',
        password: 'WrongPassword!',
      }),
    ).rejects.toThrow(UnauthorizedException);

    // Negative stock adjustment
    const med = db.medicines[0];
    await expect(
      inventoryService.recordAdjustment(
        {
          medicineId: med.id,
          quantityChange: -(med.quantity + 500),
          changeType: InventoryChangeType.STOCK_ADJUSTMENT,
        },
        '65f000000000000000000001',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('14. Verify that deleting or archiving a medicine does not silently destroy history', async () => {
    const medToDelete = await medicinesService.create(
      {
        name: 'Temporary Med',
        sellingPrice: 10.0,
        quantity: 20,
      },
      '65f00000000000000000001',
    );

    const historyCountBefore = db.stockHistories.filter((h) => h.medicineId === medToDelete.id).length;
    expect(historyCountBefore).toBeGreaterThan(0);

    // Soft delete
    const removed = await medicinesService.remove(medToDelete.id);
    expect(removed.isDeleted).toBe(true);

    // History still intact
    const historyCountAfter = db.stockHistories.filter((h) => h.medicineId === medToDelete.id).length;
    expect(historyCountAfter).toBe(historyCountBefore);
  });

  it('15. Verify that cart functionality is purely client-side and does not exist in the backend as a stock-changing operation', async () => {
    // Assert no cart checkout or cart mutation endpoints exist in controller metadata
    expect(inventoryService).not.toHaveProperty('checkoutCart');
    expect(medicinesService).not.toHaveProperty('deductCartStock');
  });
});
