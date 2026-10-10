import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryChangeType } from '@prisma/client';

describe('InventoryService', () => {
  let service: InventoryService;

  const mockPrismaService = {
    medicine: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    batch: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    stockHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getLowStock', () => {
    it('should return only medicines that have minimumStock set AND quantity <= minimumStock', async () => {
      const mockMeds = [
        {
          id: 'med-1',
          name: 'Low Stock Item',
          quantity: 3,
          minimumStock: 10,
        },
        {
          id: 'med-2',
          name: 'Healthy Stock Item',
          quantity: 25,
          minimumStock: 10,
        },
      ];

      mockPrismaService.medicine.findMany.mockResolvedValue(mockMeds);

      const result = await service.getLowStock();

      expect(result.count).toBe(1);
      expect(result.items[0].id).toBe('med-1');
      expect(result.items[0].currentQuantity).toBe(3);
      expect(result.items[0].minimumStock).toBe(10);
      expect(result.items[0].shortage).toBe(7); // 10 - 3
    });
  });

  describe('getExpiring', () => {
    it('should categorize expired and expiring items at medicine and batch levels', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 15);

      const mockMeds = [
        {
          id: 'med-1',
          name: 'Expired Syrup',
          quantity: 10,
          expiryDate: pastDate,
          batches: [],
        },
        {
          id: 'med-2',
          name: 'Expiring Capsule',
          quantity: 30,
          expiryDate: soonDate,
          batches: [
            {
              id: 'batch-1',
              batchNumber: 'B-101',
              quantity: 15,
              expiryDate: soonDate,
            },
          ],
        },
      ];

      mockPrismaService.medicine.findMany.mockResolvedValue(mockMeds);

      const result = await service.getExpiring(30);

      expect(result.expiredCount).toBe(1);
      expect(result.expiringSoonCount).toBe(1);
      expect(result.expired[0].name).toBe('Expired Syrup');
      expect(result.expiringSoon[0].name).toBe('Expiring Capsule');
    });
  });

  describe('recordReceipt', () => {
    it('should increase stock and record STOCK_RECEIVED history', async () => {
      const medicine = {
        id: 'med-1',
        name: 'Paracetamol',
        quantity: 50,
        isDeleted: false,
      };

      mockPrismaService.medicine.findFirst.mockResolvedValue(medicine);
      mockPrismaService.medicine.update.mockResolvedValue({
        ...medicine,
        quantity: 150,
      });
      mockPrismaService.batch.findFirst.mockResolvedValue(null);
      mockPrismaService.batch.create.mockResolvedValue({});
      mockPrismaService.stockHistory.create.mockResolvedValue({
        id: 'hist-1',
        quantityBefore: 50,
        quantityChanged: 100,
        quantityAfter: 150,
        changeType: InventoryChangeType.STOCK_RECEIVED,
      });

      const result = await service.recordReceipt(
        {
          medicineId: 'med-1',
          quantity: 100,
          unitPurchaseCost: 5.5,
          batchNumber: 'BATCH-2026',
          supplierName: 'Square Pharma',
        },
        'user-1',
      );

      expect(result.medicine.quantity).toBe(150);
      expect(mockPrismaService.stockHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            changeType: InventoryChangeType.STOCK_RECEIVED,
            quantityBefore: 50,
            quantityChanged: 100,
            quantityAfter: 150,
          }),
        }),
      );
    });

    it('should throw BadRequestException if receipt quantity is <= 0', async () => {
      await expect(
        service.recordReceipt(
          {
            medicineId: 'med-1',
            quantity: 0,
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordAdjustment', () => {
    it('should prevent adjustments that reduce stock below 0', async () => {
      const medicine = {
        id: 'med-1',
        name: 'Paracetamol',
        quantity: 10,
        isDeleted: false,
      };

      mockPrismaService.medicine.findFirst.mockResolvedValue(medicine);

      await expect(
        service.recordAdjustment(
          {
            medicineId: 'med-1',
            quantityChange: -15,
            changeType: InventoryChangeType.STOCK_ADJUSTMENT,
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
