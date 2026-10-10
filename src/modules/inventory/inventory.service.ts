import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { QueryStockHistoryDto } from './dto/query-stock-history.dto';
import { roundCurrency, roundQuantity } from '../../common/utils/precision.util';
import { InventoryChangeType, Prisma } from '@prisma/client';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Retrieves all medicines currently at or below their configured minimumStock threshold.
   */
  async getLowStock() {
    const medicines = await this.prisma.medicine.findMany({
      where: {
        isDeleted: false,
        minimumStock: { not: null },
      },
      select: {
        id: true,
        name: true,
        genericName: true,
        brandName: true,
        manufacturer: true,
        strength: true,
        dosageForm: true,
        quantity: true,
        minimumStock: true,
        rackLocation: true,
        supplierName: true,
        onlinePurchaseUrl: true,
      },
      orderBy: { quantity: 'asc' },
    });

    const lowStockItems = medicines
      .filter((m) => m.minimumStock !== null && m.quantity <= m.minimumStock)
      .map((m) => ({
        id: m.id,
        name: m.name,
        genericName: m.genericName,
        brandName: m.brandName,
        manufacturer: m.manufacturer,
        strength: m.strength,
        dosageForm: m.dosageForm,
        currentQuantity: m.quantity,
        minimumStock: m.minimumStock,
        shortage: roundQuantity(Math.max(0, (m.minimumStock ?? 0) - m.quantity)),
        rackLocation: m.rackLocation,
        supplierName: m.supplierName,
        onlinePurchaseUrl: m.onlinePurchaseUrl,
      }));

    return {
      count: lowStockItems.length,
      items: lowStockItems,
    };
  }

  /**
   * Retrieves expired and expiring medicines within a configurable window (default 30 days),
   * calculating expiry status at both medicine and batch level.
   */
  async getExpiring(days: number = 30) {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + days);

    const medicines = await this.prisma.medicine.findMany({
      where: {
        isDeleted: false,
      },
      include: {
        batches: true,
      },
      orderBy: { expiryDate: 'asc' },
    });

    const expired: any[] = [];
    const expiringSoon: any[] = [];

    for (const med of medicines) {
      const activeBatches = med.batches?.filter((b) => b.quantity > 0 && b.expiryDate) || [];

      if (activeBatches.length > 0) {
        // Granular batch-level tracking
        for (const batch of activeBatches) {
          const bExp = new Date(batch.expiryDate!);
          const daysRemaining = Math.ceil((bExp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          const batchData = {
            medicineId: med.id,
            batchId: batch.id,
            name: med.name,
            genericName: med.genericName,
            brandName: med.brandName,
            batchNumber: batch.batchNumber,
            quantity: batch.quantity,
            expiryDate: batch.expiryDate,
            daysRemaining,
            scope: 'BATCH_LEVEL',
          };

          if (bExp < now) {
            expired.push({ ...batchData, status: 'EXPIRED' });
          } else if (bExp <= thresholdDate) {
            expiringSoon.push({ ...batchData, status: 'EXPIRING_SOON' });
          }
        }
      } else if (med.expiryDate && med.quantity > 0) {
        // Root medicine-level tracking when no batches are configured
        const exp = new Date(med.expiryDate);
        const daysRemaining = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        const itemData = {
          medicineId: med.id,
          name: med.name,
          genericName: med.genericName,
          brandName: med.brandName,
          batchNumber: med.batchNumber,
          quantity: med.quantity,
          expiryDate: med.expiryDate,
          daysRemaining,
          scope: 'MEDICINE_LEVEL',
        };

        if (exp < now) {
          expired.push({ ...itemData, status: 'EXPIRED' });
        } else if (exp <= thresholdDate) {
          expiringSoon.push({ ...itemData, status: 'EXPIRING_SOON' });
        }
      }
    }

    return {
      windowDays: days,
      expiredCount: expired.length,
      expiringSoonCount: expiringSoon.length,
      expired,
      expiringSoon,
    };
  }

  /**
   * Records a stock receipt (purchase/inward delivery).
   */
  async recordReceipt(receiptDto: CreateReceiptDto, userId: string) {
    const {
      medicineId,
      quantity,
      unitPurchaseCost,
      batchNumber,
      expiryDate,
      supplierName,
      notes,
    } = receiptDto;

    const roundedQty = roundQuantity(quantity);
    if (roundedQty <= 0) {
      throw new BadRequestException('Receipt quantity must be greater than 0');
    }

    const medicine = await this.prisma.medicine.findFirst({
      where: { id: medicineId, isDeleted: false },
    });

    if (!medicine) {
      throw new NotFoundException(`Medicine with ID ${medicineId} not found`);
    }

    const quantityBefore = roundQuantity(medicine.quantity);
    const quantityAfter = roundQuantity(quantityBefore + roundedQty);
    const roundedCost =
      unitPurchaseCost !== undefined && unitPurchaseCost !== null
        ? roundCurrency(unitPurchaseCost)
        : null;

    const trimmedBatch = batchNumber?.trim() || null;
    const parsedExpiry = expiryDate ? new Date(expiryDate) : null;
    const trimmedSupplier = supplierName?.trim() || null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updatedMed = await tx.medicine.update({
          where: { id: medicineId },
          data: {
            quantity: quantityAfter,
            ...(trimmedBatch && { batchNumber: trimmedBatch }),
            ...(parsedExpiry && { expiryDate: parsedExpiry }),
            ...(roundedCost !== null && { purchasePrice: roundedCost }),
            ...(trimmedSupplier && { supplierName: trimmedSupplier }),
          },
        });

        if (trimmedBatch) {
          const existingBatch = await tx.batch.findFirst({
            where: { medicineId, batchNumber: trimmedBatch },
          });

          if (existingBatch) {
            await tx.batch.update({
              where: { id: existingBatch.id },
              data: {
                quantity: roundQuantity(existingBatch.quantity + roundedQty),
                ...(parsedExpiry && { expiryDate: parsedExpiry }),
                ...(roundedCost !== null && { purchasePrice: roundedCost }),
              },
            });
          } else {
            await tx.batch.create({
              data: {
                medicineId,
                batchNumber: trimmedBatch,
                quantity: roundedQty,
                expiryDate: parsedExpiry,
                purchasePrice: roundedCost,
              },
            });
          }
        }

        const historyRecord = await tx.stockHistory.create({
          data: {
            medicineId,
            userId,
            changeType: InventoryChangeType.STOCK_RECEIVED,
            quantityBefore,
            quantityChanged: roundedQty,
            quantityAfter,
            batchNumber: trimmedBatch,
            unitPurchaseCost: roundedCost,
            reason: notes?.trim() || `Received shipment from ${trimmedSupplier || 'supplier'}`,
          },
        });

        return {
          medicine: updatedMed,
          history: historyRecord,
        };
      });
    } catch (error) {
      this.logger.warn(`Transaction fallback for receipt: ${error.message}`);
      const updatedMed = await this.prisma.medicine.update({
        where: { id: medicineId },
        data: {
          quantity: quantityAfter,
          ...(trimmedBatch && { batchNumber: trimmedBatch }),
          ...(parsedExpiry && { expiryDate: parsedExpiry }),
          ...(roundedCost !== null && { purchasePrice: roundedCost }),
          ...(trimmedSupplier && { supplierName: trimmedSupplier }),
        },
      });

      if (trimmedBatch) {
        const existingBatch = await this.prisma.batch.findFirst({
          where: { medicineId, batchNumber: trimmedBatch },
        });

        if (existingBatch) {
          await this.prisma.batch.update({
            where: { id: existingBatch.id },
            data: {
              quantity: roundQuantity(existingBatch.quantity + roundedQty),
              ...(parsedExpiry && { expiryDate: parsedExpiry }),
              ...(roundedCost !== null && { purchasePrice: roundedCost }),
            },
          });
        } else {
          await this.prisma.batch.create({
            data: {
              medicineId,
              batchNumber: trimmedBatch,
              quantity: roundedQty,
              expiryDate: parsedExpiry,
              purchasePrice: roundedCost,
            },
          });
        }
      }

      const historyRecord = await this.prisma.stockHistory.create({
        data: {
          medicineId,
          userId,
          changeType: InventoryChangeType.STOCK_RECEIVED,
          quantityBefore,
          quantityChanged: roundedQty,
          quantityAfter,
          batchNumber: trimmedBatch,
          unitPurchaseCost: roundedCost,
          reason: notes?.trim() || `Received shipment from ${trimmedSupplier || 'supplier'}`,
        },
      });

      return {
        medicine: updatedMed,
        history: historyRecord,
      };
    }
  }

  /**
   * Records an inventory adjustment/correction or write-off.
   */
  async recordAdjustment(adjustmentDto: CreateAdjustmentDto, userId: string) {
    const { medicineId, quantityChange, changeType, batchNumber, reason } = adjustmentDto;

    const roundedChange = roundQuantity(quantityChange);
    if (roundedChange === 0) {
      throw new BadRequestException('Adjustment quantity change cannot be 0');
    }

    const medicine = await this.prisma.medicine.findFirst({
      where: { id: medicineId, isDeleted: false },
    });

    if (!medicine) {
      throw new NotFoundException(`Medicine with ID ${medicineId} not found`);
    }

    const quantityBefore = roundQuantity(medicine.quantity);
    const quantityAfter = roundQuantity(quantityBefore + roundedChange);

    if (quantityAfter < 0) {
      throw new BadRequestException(
        `Insufficient stock. Current stock is ${quantityBefore}, cannot reduce by ${Math.abs(roundedChange)}.`,
      );
    }

    const trimmedBatch = batchNumber?.trim() || null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updatedMed = await tx.medicine.update({
          where: { id: medicineId },
          data: {
            quantity: quantityAfter,
          },
        });

        if (trimmedBatch) {
          const existingBatch = await tx.batch.findFirst({
            where: { medicineId, batchNumber: trimmedBatch },
          });

          if (existingBatch) {
            const newBatchQty = roundQuantity(Math.max(0, existingBatch.quantity + roundedChange));
            await tx.batch.update({
              where: { id: existingBatch.id },
              data: { quantity: newBatchQty },
            });
          }
        }

        const historyRecord = await tx.stockHistory.create({
          data: {
            medicineId,
            userId,
            changeType,
            quantityBefore,
            quantityChanged: roundedChange,
            quantityAfter,
            batchNumber: trimmedBatch,
            reason: reason?.trim() || null,
          },
        });

        return {
          medicine: updatedMed,
          history: historyRecord,
        };
      });
    } catch (error) {
      this.logger.warn(`Transaction fallback for adjustment: ${error.message}`);
      const updatedMed = await this.prisma.medicine.update({
        where: { id: medicineId },
        data: {
          quantity: quantityAfter,
        },
      });

      if (trimmedBatch) {
        const existingBatch = await this.prisma.batch.findFirst({
          where: { medicineId, batchNumber: trimmedBatch },
        });

        if (existingBatch) {
          const newBatchQty = roundQuantity(Math.max(0, existingBatch.quantity + roundedChange));
          await this.prisma.batch.update({
            where: { id: existingBatch.id },
            data: { quantity: newBatchQty },
          });
        }
      }

      const historyRecord = await this.prisma.stockHistory.create({
        data: {
          medicineId,
          userId,
          changeType,
          quantityBefore,
          quantityChanged: roundedChange,
          quantityAfter,
          batchNumber: trimmedBatch,
          reason: reason?.trim() || null,
        },
      });

      return {
        medicine: updatedMed,
        history: historyRecord,
      };
    }
  }

  /**
   * Retrieves paginated system-wide or medicine-specific stock history.
   */
  async getHistory(query: QueryStockHistoryDto) {
    const { medicineId, changeType, page = 1, limit = 20 } = query;

    const where: Prisma.StockHistoryWhereInput = {};

    if (medicineId) {
      where.medicineId = medicineId;
    }

    if (changeType) {
      where.changeType = changeType;
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.stockHistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          medicine: {
            select: {
              id: true,
              name: true,
              genericName: true,
              strength: true,
              dosageForm: true,
              rackLocation: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.stockHistory.count({ where }),
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
}
