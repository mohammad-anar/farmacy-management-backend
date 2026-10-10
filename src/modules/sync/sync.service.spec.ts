import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncEntityType, SyncOperationType } from './dto/sync-push.dto';

describe('SyncService', () => {
  let service: SyncService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      processedSyncOperation: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      medicine: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      stockHistory: {
        create: jest.fn(),
      },
      batch: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processPushBatch - Idempotency', () => {
    it('should return cached result if operation was already processed', async () => {
      const cachedResult = {
        operationId: 'op-123',
        success: true,
        entityId: 'med-1',
        serverId: 'srv-1',
      };

      prisma.processedSyncOperation.findUnique.mockResolvedValue({
        clientOperationId: 'op-123',
        result: JSON.stringify(cachedResult),
      });

      const response = await service.processPushBatch(
        {
          operations: [
            {
              operationId: 'op-123',
              operationType: SyncOperationType.CREATE_MEDICINE,
              entityType: SyncEntityType.MEDICINE,
              entityId: 'med-1',
              payload: { name: 'Amoxicillin 500mg', sellingPrice: 15, quantity: 100 },
            },
          ],
        },
        'user-1',
      );

      expect(response.results).toHaveLength(1);
      expect(response.results[0]).toEqual(cachedResult);
      expect(prisma.medicine.create).not.toHaveBeenCalled();
    });

    it('should process a new CREATE_MEDICINE operation and record in stockHistory', async () => {
      prisma.processedSyncOperation.findUnique.mockResolvedValue(null);
      prisma.medicine.create.mockResolvedValue({
        id: 'srv-med-99',
        name: 'Paracetamol 500mg',
        sellingPrice: 10,
        quantity: 50,
        batchNumber: 'BATCH-01',
        purchasePrice: 6,
        batches: [],
      });
      prisma.stockHistory.create.mockResolvedValue({ id: 'hist-1' });
      prisma.processedSyncOperation.create.mockResolvedValue({});

      const response = await service.processPushBatch(
        {
          operations: [
            {
              operationId: 'op-create-1',
              operationType: SyncOperationType.CREATE_MEDICINE,
              entityType: SyncEntityType.MEDICINE,
              entityId: 'client-med-1',
              clientId: 'client-med-1',
              payload: {
                name: 'Paracetamol 500mg',
                sellingPrice: 10,
                quantity: 50,
                batchNumber: 'BATCH-01',
                purchasePrice: 6,
              },
            },
          ],
        },
        'user-1',
      );

      expect(response.results[0].success).toBe(true);
      expect(response.results[0].serverId).toBe('srv-med-99');
      expect(prisma.medicine.create).toHaveBeenCalled();
      expect(prisma.stockHistory.create).toHaveBeenCalled();
      expect(prisma.processedSyncOperation.create).toHaveBeenCalled();
    });

    it('should process ADJUST_STOCK operation safely', async () => {
      prisma.processedSyncOperation.findUnique.mockResolvedValue(null);
      prisma.medicine.findUnique.mockResolvedValue({
        id: 'srv-med-1',
        name: 'Paracetamol',
        quantity: 20,
      });
      prisma.medicine.update.mockResolvedValue({
        id: 'srv-med-1',
        quantity: 15,
      });
      prisma.stockHistory.create.mockResolvedValue({});
      prisma.processedSyncOperation.create.mockResolvedValue({});

      const response = await service.processPushBatch(
        {
          operations: [
            {
              operationId: 'op-adj-1',
              operationType: SyncOperationType.ADJUST_STOCK,
              entityType: SyncEntityType.STOCK,
              entityId: 'srv-med-1',
              payload: { delta: -5, reason: 'Damaged item' },
            },
          ],
        },
        'user-1',
      );

      expect(response.results[0].success).toBe(true);
      expect(prisma.medicine.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { quantity: 15 },
        }),
      );
    });
  });

  describe('pullUpdates', () => {
    it('should query updated items and return next cursor', async () => {
      const updatedAt = new Date('2026-10-10T12:00:00Z');
      prisma.medicine.findMany.mockResolvedValue([
        {
          id: 'med-1',
          name: 'Omeprazole',
          updatedAt,
          batches: [],
        },
      ]);

      const result = await service.pullUpdates({
        cursor: '2026-10-10T00:00:00Z',
        limit: 100,
      });

      expect(result.items).toHaveLength(1);
      expect(result.serverCursor).toBe(updatedAt.toISOString());
      expect(result.hasMore).toBe(false);
    });
  });
});
