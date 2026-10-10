import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMedicineDto } from './dto/create-medicine.dto';
import { UpdateMedicineDto } from './dto/update-medicine.dto';
import { QueryMedicineDto } from './dto/query-medicine.dto';
import { roundCurrency, roundQuantity } from '../../common/utils/precision.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class MedicinesService {
  private readonly logger = new Logger(MedicinesService.name);

  constructor(private prisma: PrismaService) {}

  async create(createMedicineDto: CreateMedicineDto, userId: string) {
    const {
      name,
      sellingPrice,
      quantity,
      genericName,
      brandName,
      manufacturer,
      strength,
      dosageForm,
      category,
      barcode,
      purchasePrice,
      minimumStock,
      rackLocation,
      supplierName,
      batchNumber,
      expiryDate,
      imageUrl,
      notes,
      onlinePurchaseUrl,
    } = createMedicineDto;

    // Enforce name uniqueness among active medicines
    const trimmedName = name.trim();
    const existingWithName = await this.prisma.medicine.findFirst({
      where: {
        name: { equals: trimmedName, mode: 'insensitive' },
        isDeleted: false,
      },
    });

    if (existingWithName) {
      throw new ConflictException(
        `A medicine with the name '${trimmedName}' already exists (এই নামের মেডিসিন ইতিমধ্যে বিদ্যমান).`,
      );
    }

    // Enforce barcode uniqueness among active medicines when barcode is supplied
    if (barcode && barcode.trim() !== '') {
      const existingWithBarcode = await this.prisma.medicine.findFirst({
        where: {
          barcode: barcode.trim(),
          isDeleted: false,
        },
      });

      if (existingWithBarcode) {
        throw new ConflictException(
          `A medicine with barcode '${barcode.trim()}' already exists (${existingWithBarcode.name}).`,
        );
      }
    }

    const roundedSellingPrice = roundCurrency(sellingPrice) ?? 0;
    const roundedQuantity = roundQuantity(quantity);
    const roundedPurchasePrice =
      purchasePrice !== undefined && purchasePrice !== null ? roundCurrency(purchasePrice) : null;
    const roundedMinStock =
      minimumStock !== undefined && minimumStock !== null ? roundQuantity(minimumStock) : null;

    const trimmedBatch = batchNumber?.trim() || null;
    const parsedExpiry = expiryDate ? new Date(expiryDate) : null;

    const medicine = await this.prisma.medicine.create({
      data: {
        name: name.trim(),
        sellingPrice: roundedSellingPrice,
        quantity: roundedQuantity,
        genericName: genericName?.trim() || null,
        brandName: brandName?.trim() || null,
        manufacturer: manufacturer?.trim() || null,
        strength: strength?.trim() || null,
        dosageForm: dosageForm?.trim() || null,
        category: category?.trim() || null,
        barcode: barcode?.trim() || null,
        purchasePrice: roundedPurchasePrice,
        minimumStock: roundedMinStock,
        rackLocation: rackLocation?.trim() || null,
        supplierName: supplierName?.trim() || null,
        batchNumber: trimmedBatch,
        expiryDate: parsedExpiry,
        imageUrl: imageUrl?.trim() || null,
        notes: notes?.trim() || null,
        onlinePurchaseUrl: onlinePurchaseUrl?.trim() || null,
      },
    });

    // Optional Batch Lot Creation if batch details are provided
    if (trimmedBatch && roundedQuantity > 0) {
      await this.prisma.batch.create({
        data: {
          medicineId: medicine.id,
          batchNumber: trimmedBatch,
          quantity: roundedQuantity,
          expiryDate: parsedExpiry,
          purchasePrice: roundedPurchasePrice,
        },
      });
    }

    // Record initial inventory history
    if (roundedQuantity > 0) {
      await this.prisma.stockHistory.create({
        data: {
          medicineId: medicine.id,
          userId,
          changeType: 'INITIAL_STOCK',
          quantityBefore: 0,
          quantityChanged: roundedQuantity,
          quantityAfter: roundedQuantity,
          batchNumber: trimmedBatch,
          unitPurchaseCost: roundedPurchasePrice,
          reason: 'Initial inventory quantity upon creation',
        },
      });
    }

    return medicine;
  }

  async findAll(query: QueryMedicineDto) {
    const {
      search,
      category,
      dosageForm,
      isLowStock,
      isExpiringSoon,
      isExpired,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.MedicineWhereInput = {
      isDeleted: false,
    };

    if (search && search.trim() !== '') {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { genericName: { contains: term, mode: 'insensitive' } },
        { brandName: { contains: term, mode: 'insensitive' } },
        { manufacturer: { contains: term, mode: 'insensitive' } },
        { barcode: { contains: term, mode: 'insensitive' } },
        { strength: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = { equals: category.trim(), mode: 'insensitive' };
    }

    if (dosageForm) {
      where.dosageForm = { equals: dosageForm.trim(), mode: 'insensitive' };
    }

    const now = new Date();

    if (isExpired) {
      where.expiryDate = {
        not: null,
        lt: now,
      };
    } else if (isExpiringSoon) {
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

      where.expiryDate = {
        not: null,
        gte: now,
        lte: thirtyDaysLater,
      };
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.medicine.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          batches: true,
        },
      }),
      this.prisma.medicine.count({ where }),
    ]);

    let filteredItems = items;
    if (isLowStock) {
      filteredItems = items.filter((m) => {
        if (m.minimumStock !== null) {
          return m.quantity <= m.minimumStock;
        }
        return false; // Only classified as low stock if minimumStock is configured
      });
    }

    return {
      items: filteredItems,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async search(q: string = '', page: number = 1, limit: number = 20) {
    const term = q.trim();
    const where: Prisma.MedicineWhereInput = {
      isDeleted: false,
    };

    if (term !== '') {
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { genericName: { contains: term, mode: 'insensitive' } },
        { brandName: { contains: term, mode: 'insensitive' } },
        { manufacturer: { contains: term, mode: 'insensitive' } },
        { barcode: { contains: term, mode: 'insensitive' } },
        { strength: { contains: term, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.medicine.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          batches: true,
        },
      }),
      this.prisma.medicine.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const medicine = await this.prisma.medicine.findFirst({
      where: { id, isDeleted: false },
      include: {
        batches: {
          orderBy: { createdAt: 'desc' },
        },
        stockHistories: {
          take: 15,
          orderBy: { timestamp: 'desc' },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!medicine) {
      throw new NotFoundException(`Medicine with ID ${id} not found`);
    }

    return medicine;
  }

  async update(id: string, updateDto: UpdateMedicineDto) {
    const existing = await this.findOne(id);

    // If barcode is changing, verify uniqueness
    if (updateDto.barcode !== undefined && updateDto.barcode !== null && updateDto.barcode.trim() !== '') {
      const trimmedBarcode = updateDto.barcode.trim();
      if (trimmedBarcode !== existing.barcode) {
        const conflict = await this.prisma.medicine.findFirst({
          where: {
            barcode: trimmedBarcode,
            isDeleted: false,
            NOT: { id },
          },
        });
        if (conflict) {
          throw new ConflictException(
            `A medicine with barcode '${trimmedBarcode}' already exists (${conflict.name}).`,
          );
        }
      }
    }

    const updateData: Prisma.MedicineUpdateInput = {};

    if (updateDto.name !== undefined) {
      const trimmedName = updateDto.name.trim();
      const conflict = await this.prisma.medicine.findFirst({
        where: {
          name: { equals: trimmedName, mode: 'insensitive' },
          isDeleted: false,
          NOT: { id },
        },
      });
      if (conflict) {
        throw new ConflictException(
          `A medicine with the name '${trimmedName}' already exists (এই নামের মেডিসিন ইতিমধ্যে বিদ্যমান).`,
        );
      }
      updateData.name = trimmedName;
    }
    if (updateDto.sellingPrice !== undefined) updateData.sellingPrice = roundCurrency(updateDto.sellingPrice) ?? 0;
    if (updateDto.quantity !== undefined) updateData.quantity = roundQuantity(updateDto.quantity);
    if (updateDto.genericName !== undefined) updateData.genericName = updateDto.genericName ? updateDto.genericName.trim() : null;
    if (updateDto.brandName !== undefined) updateData.brandName = updateDto.brandName ? updateDto.brandName.trim() : null;
    if (updateDto.manufacturer !== undefined) updateData.manufacturer = updateDto.manufacturer ? updateDto.manufacturer.trim() : null;
    if (updateDto.strength !== undefined) updateData.strength = updateDto.strength ? updateDto.strength.trim() : null;
    if (updateDto.dosageForm !== undefined) updateData.dosageForm = updateDto.dosageForm ? updateDto.dosageForm.trim() : null;
    if (updateDto.category !== undefined) updateData.category = updateDto.category ? updateDto.category.trim() : null;
    if (updateDto.barcode !== undefined) updateData.barcode = updateDto.barcode ? updateDto.barcode.trim() : null;
    if (updateDto.purchasePrice !== undefined) {
      updateData.purchasePrice = updateDto.purchasePrice !== null ? roundCurrency(updateDto.purchasePrice) : null;
    }
    if (updateDto.minimumStock !== undefined) {
      updateData.minimumStock = updateDto.minimumStock !== null ? roundQuantity(updateDto.minimumStock) : null;
    }
    if (updateDto.rackLocation !== undefined) updateData.rackLocation = updateDto.rackLocation ? updateDto.rackLocation.trim() : null;
    if (updateDto.supplierName !== undefined) updateData.supplierName = updateDto.supplierName ? updateDto.supplierName.trim() : null;
    if (updateDto.batchNumber !== undefined) updateData.batchNumber = updateDto.batchNumber ? updateDto.batchNumber.trim() : null;
    if (updateDto.expiryDate !== undefined) {
      updateData.expiryDate = updateDto.expiryDate ? new Date(updateDto.expiryDate) : null;
    }
    if (updateDto.imageUrl !== undefined) updateData.imageUrl = updateDto.imageUrl ? updateDto.imageUrl.trim() : null;
    if (updateDto.notes !== undefined) updateData.notes = updateDto.notes ? updateDto.notes.trim() : null;
    if (updateDto.onlinePurchaseUrl !== undefined) updateData.onlinePurchaseUrl = updateDto.onlinePurchaseUrl ? updateDto.onlinePurchaseUrl.trim() : null;

    return this.prisma.medicine.update({
      where: { id },
      data: updateData,
      include: {
        batches: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // Soft-delete to preserve inventory history records
    return this.prisma.medicine.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }
}
