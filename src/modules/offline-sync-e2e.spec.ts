import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync/sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncOperationType, SyncEntityType } from './sync/dto/sync-push.dto';

describe('Offline-First Sync End-to-End Test Suite', () => {
  let syncService: SyncService;
  let prisma: any;

  const mockUser = {
    userId: '65f1a2b3c4d5e6f7a8b9c0d1',
  };

  beforeEach(async () => {
    const memoryMedicines: any[] = [];
    const memoryStockHistories: any[] = [];
    const memoryBatches: any[] = [];
    const memoryProcessedOps: Map<string, any> = new Map();

    prisma = {
      medicine: {
        create: jest.fn().mockImplementation(({ data, include }) => {
          const id = `srv_med_${memoryMedicines.length + 1}`;
          const newMed = {
            id,
            ...data,
            isDeleted: false,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            batches: [],
          };
          memoryMedicines.push(newMed);
          return Promise.resolve(newMed);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const found = memoryMedicines.find((m) => m.id === where.id);
          return Promise.resolve(found || null);
        }),
        findMany: jest.fn().mockImplementation(({ where, include, orderBy, take }) => {
          let list = [...memoryMedicines];
          if (where?.updatedAt?.gt) {
            list = list.filter((m) => m.updatedAt > where.updatedAt.gt);
          }
          return Promise.resolve(list.slice(0, take || 100));
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const index = memoryMedicines.findIndex((m) => m.id === where.id);
          if (index === -1) throw new Error('Medicine not found');
          memoryMedicines[index] = {
            ...memoryMedicines[index],
            ...data,
            updatedAt: new Date(),
          };
          return Promise.resolve(memoryMedicines[index]);
        }),
      },
      stockHistory: {
        create: jest.fn().mockImplementation(({ data }) => {
          const hist = { id: `hist_${memoryStockHistories.length + 1}`, ...data, timestamp: new Date() };
          memoryStockHistories.push(hist);
          return Promise.resolve(hist);
        }),
      },
      batch: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const b = memoryBatches.find((x) => x.medicineId === where.medicineId && x.batchNumber === where.batchNumber);
          return Promise.resolve(b || null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const b = { id: `batch_${memoryBatches.length + 1}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          memoryBatches.push(b);
          return Promise.resolve(b);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const idx = memoryBatches.findIndex((x) => x.id === where.id);
          if (idx !== -1) {
            memoryBatches[idx] = { ...memoryBatches[idx], ...data, updatedAt: new Date() };
            return Promise.resolve(memoryBatches[idx]);
          }
          return Promise.resolve(null);
        }),
      },
      processedSyncOperation: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const found = memoryProcessedOps.get(where.clientOperationId);
          return Promise.resolve(found ? { clientOperationId: where.clientOperationId, result: JSON.stringify(found) } : null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          memoryProcessedOps.set(data.clientOperationId, JSON.parse(data.result));
          return Promise.resolve(data);
        }),
      },
      _memoryMedicines: memoryMedicines,
      _memoryStockHistories: memoryStockHistories,
      _memoryProcessedOps: memoryProcessedOps,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    syncService = module.get<SyncService>(SyncService);
  });

  describe('Scenario 1: Offline Creation & Synchronization', () => {
    it('should create medicine on server, assign canonical ID, and log initial stock', async () => {
      const clientEntityId = 'med_uuid_101';
      const clientOpId = 'op_create_101';

      const pushPayload = {
        operations: [
          {
            operationId: clientOpId,
            operationType: SyncOperationType.CREATE_MEDICINE,
            entityType: SyncEntityType.MEDICINE,
            entityId: clientEntityId,
            clientId: clientEntityId,
            payload: {
              name: 'Omeprazole 20mg Capsule',
              sellingPrice: 12.5,
              quantity: 100,
              genericName: 'Omeprazole',
              brandName: 'Losec',
              minimumStock: 20,
              purchasePrice: 7.25,
            },
          },
        ],
      };

      const res = await syncService.processPushBatch(pushPayload, mockUser.userId);

      expect(res.results).toHaveLength(1);
      const result = res.results[0];
      expect(result.success).toBe(true);
      expect(result.clientId).toBe(clientEntityId);
      expect(result.serverId).toBeDefined();
      expect(result.record.name).toBe('Omeprazole 20mg Capsule');
      expect(result.record.quantity).toBe(100);

      // Verify StockHistory was created for initial stock
      expect(prisma._memoryStockHistories).toHaveLength(1);
      expect(prisma._memoryStockHistories[0].quantityChanged).toBe(100);
      expect(prisma._memoryStockHistories[0].changeType).toBe('INITIAL_STOCK');
    });
  });

  describe('Scenario 2: Offline Stock Adjustment with Delta', () => {
    it('should apply stock adjustment delta and record audit log', async () => {
      // 1. Create medicine first
      const createRes = await syncService.processPushBatch(
        {
          operations: [
            {
              operationId: 'op_create_201',
              operationType: SyncOperationType.CREATE_MEDICINE,
              entityType: SyncEntityType.MEDICINE,
              entityId: 'med_uuid_201',
              payload: { name: 'Azithromycin 500mg', sellingPrice: 35.0, quantity: 50 },
            },
          ],
        },
        mockUser.userId,
      );

      const serverId = createRes.results[0].serverId!;

      // 2. Offline adjustment: +20 units received
      const adjRes = await syncService.processPushBatch(
        {
          operations: [
            {
              operationId: 'op_adj_201',
              operationType: SyncOperationType.ADJUST_STOCK,
              entityType: SyncEntityType.STOCK,
              entityId: serverId,
              payload: { delta: 20, reason: 'Restock received' },
            },
          ],
        },
        mockUser.userId,
      );

      expect(adjRes.results[0].success).toBe(true);
      expect(adjRes.results[0].record.quantity).toBe(70);

      // Verify audit logs (1 INITIAL_STOCK + 1 STOCK_ADJUSTMENT)
      expect(prisma._memoryStockHistories).toHaveLength(2);
      expect(prisma._memoryStockHistories[1].quantityBefore).toBe(50);
      expect(prisma._memoryStockHistories[1].quantityChanged).toBe(20);
      expect(prisma._memoryStockHistories[1].quantityAfter).toBe(70);
    });
  });

  describe('Scenario 3: Retry Safety & Server-Side Idempotency', () => {
    it('should not duplicate operations or stock changes when retrying identical operation IDs', async () => {
      const opId = 'op_idempotent_301';

      // 1. First push
      const res1 = await syncService.processPushBatch(
        {
          operations: [
            {
              operationId: opId,
              operationType: SyncOperationType.CREATE_MEDICINE,
              entityType: SyncEntityType.MEDICINE,
              entityId: 'med_uuid_301',
              payload: { name: 'Ciprofloxacin 500mg', sellingPrice: 22.0, quantity: 40 },
            },
          ],
        },
        mockUser.userId,
      );

      expect(res1.results[0].success).toBe(true);
      const serverId = res1.results[0].serverId;
      expect(prisma._memoryMedicines).toHaveLength(1);
      expect(prisma._memoryStockHistories).toHaveLength(1);

      // 2. Retry identical push (e.g. simulated connection timeout where server processed but client lost response)
      const res2 = await syncService.processPushBatch(
        {
          operations: [
            {
              operationId: opId,
              operationType: SyncOperationType.CREATE_MEDICINE,
              entityType: SyncEntityType.MEDICINE,
              entityId: 'med_uuid_301',
              payload: { name: 'Ciprofloxacin 500mg', sellingPrice: 22.0, quantity: 40 },
            },
          ],
        },
        mockUser.userId,
      );

      expect(res2.results[0].success).toBe(true);
      expect(res2.results[0].serverId).toBe(serverId);

      // Verify NO duplicate medicines or stock histories were created
      expect(prisma._memoryMedicines).toHaveLength(1);
      expect(prisma._memoryStockHistories).toHaveLength(1);
    });
  });

  describe('Scenario 4: Incremental Pull Cursor', () => {
    it('should return updated medicines and advance cursor', async () => {
      // Create medicine
      await syncService.processPushBatch(
        {
          operations: [
            {
              operationId: 'op_pull_401',
              operationType: SyncOperationType.CREATE_MEDICINE,
              entityType: SyncEntityType.MEDICINE,
              entityId: 'med_uuid_401',
              payload: { name: 'Cetirizine 10mg', sellingPrice: 5.0, quantity: 150 },
            },
          ],
        },
        mockUser.userId,
      );

      const pullRes = await syncService.pullUpdates({ limit: 50 });
      expect(pullRes.items.length).toBeGreaterThanOrEqual(1);
      expect(pullRes.serverCursor).toBeDefined();
      expect(pullRes.hasMore).toBe(false);
    });
  });
});
