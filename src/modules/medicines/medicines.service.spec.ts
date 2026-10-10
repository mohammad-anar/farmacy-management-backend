import { Test, TestingModule } from '@nestjs/testing';
import { MedicinesService } from './medicines.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('MedicinesService', () => {
  let service: MedicinesService;

  const mockPrismaService = {
    medicine: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    batch: {
      create: jest.fn(),
    },
    stockHistory: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicinesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MedicinesService>(MedicinesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create medicine with only 3 mandatory fields and preserve null for optional fields', async () => {
    const dto = {
      name: 'Napa Extra 500mg',
      sellingPrice: 15.5,
      quantity: 100,
    };

    const createdMedicine = {
      id: '65f111111111111111111111',
      ...dto,
      genericName: null,
      purchasePrice: null,
      minimumStock: null,
      isDeleted: false,
    };

    mockPrismaService.medicine.findFirst.mockResolvedValue(null);
    mockPrismaService.medicine.create.mockResolvedValue(createdMedicine);
    mockPrismaService.stockHistory.create.mockResolvedValue({});

    const result = await service.create(dto, 'user-123');

    expect(result.name).toBe('Napa Extra 500mg');
    expect(result.sellingPrice).toBe(15.5);
    expect(result.quantity).toBe(100);
    expect(mockPrismaService.medicine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Napa Extra 500mg',
          sellingPrice: 15.5,
          quantity: 100,
          purchasePrice: null,
          genericName: null,
        }),
      }),
    );
  });

  it('should reject creation if another active medicine has the same barcode', async () => {
    mockPrismaService.medicine.findFirst.mockResolvedValue({
      id: 'med-existing',
      name: 'Existing Napa',
      barcode: '8901234567890',
    });

    await expect(
      service.create(
        {
          name: 'New Napa',
          sellingPrice: 10,
          quantity: 20,
          barcode: '8901234567890',
        },
        'user-1',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('should search medicines across name, genericName, brand, barcode', async () => {
    mockPrismaService.medicine.findMany.mockResolvedValue([
      { id: '1', name: 'Napa Extra 500mg' },
    ]);
    mockPrismaService.medicine.count.mockResolvedValue(1);

    const result = await service.search('napa', 1, 10);

    expect(result.items.length).toBe(1);
    expect(result.meta.total).toBe(1);
    expect(mockPrismaService.medicine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          OR: expect.arrayContaining([
            { name: { contains: 'napa', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });

  it('should soft-delete medicine without removing records from DB', async () => {
    mockPrismaService.medicine.findFirst.mockResolvedValue({
      id: '65f111111111111111111111',
      isDeleted: false,
    });
    mockPrismaService.medicine.update.mockResolvedValue({
      id: '65f111111111111111111111',
      isDeleted: true,
      deletedAt: new Date(),
    });

    const result = await service.remove('65f111111111111111111111');
    expect(result.isDeleted).toBe(true);
    expect(mockPrismaService.medicine.update).toHaveBeenCalledWith({
      where: { id: '65f111111111111111111111' },
      data: expect.objectContaining({ isDeleted: true }),
    });
  });

  it('should throw NotFoundException if medicine to delete does not exist', async () => {
    mockPrismaService.medicine.findFirst.mockResolvedValue(null);

    await expect(service.remove('invalid-id')).rejects.toThrow(NotFoundException);
  });
});
