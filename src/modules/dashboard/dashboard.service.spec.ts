import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const mockPrismaService = {
    medicine: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should compute dashboard summary counts and values accurately', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);

    const nearFutureDate = new Date();
    nearFutureDate.setDate(nearFutureDate.getDate() + 10);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 100);

    const mockMedicines = [
      {
        id: '1',
        name: 'Med 1 - Low Stock',
        sellingPrice: 10,
        purchasePrice: 6,
        quantity: 2,
        minimumStock: 5, // Low stock
        expiryDate: futureDate,
      },
      {
        id: '2',
        name: 'Med 2 - Expired',
        sellingPrice: 20,
        purchasePrice: 12,
        quantity: 10,
        minimumStock: 5,
        expiryDate: pastDate, // Expired
      },
      {
        id: '3',
        name: 'Med 3 - Expiring Soon',
        sellingPrice: 15,
        purchasePrice: null, // Null purchase price preserved
        quantity: 20,
        minimumStock: 10,
        expiryDate: nearFutureDate, // Expiring soon
      },
    ];

    mockPrismaService.medicine.findMany.mockResolvedValue(mockMedicines);

    const summary = await service.getSummary();

    expect(summary.totalMedicines).toBe(3);
    expect(summary.totalStockUnits).toBe(32); // 2 + 10 + 20
    expect(summary.totalSellingValue).toBe(520); // (10*2) + (20*10) + (15*20) = 20 + 200 + 300 = 520
    expect(summary.totalCostValue).toBe(132); // (6*2) + (12*10) + 0 = 12 + 120 = 132
    expect(summary.lowStockCount).toBe(1);
    expect(summary.expiredCount).toBe(1);
    expect(summary.expiringSoonCount).toBe(1);
  });
});
