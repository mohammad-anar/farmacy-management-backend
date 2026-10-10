import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { roundCurrency, roundQuantity } from '../../common/utils/precision.util';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary() {
    const medicines = await this.prisma.medicine.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        name: true,
        sellingPrice: true,
        purchasePrice: true,
        quantity: true,
        minimumStock: true,
        expiryDate: true,
      },
    });

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    let totalStockUnits = 0;
    let totalSellingValue = 0;
    let totalCostValue = 0;
    let lowStockCount = 0;
    let expiredCount = 0;
    let expiringSoonCount = 0;

    for (const med of medicines) {
      const qty = med.quantity || 0;
      totalStockUnits += qty;
      totalSellingValue += (med.sellingPrice || 0) * qty;

      if (med.purchasePrice !== null && med.purchasePrice !== undefined) {
        totalCostValue += med.purchasePrice * qty;
      }

      // Check low stock
      if (med.minimumStock !== null && med.minimumStock !== undefined) {
        if (qty <= med.minimumStock) {
          lowStockCount++;
        }
      } else if (qty <= 0) {
        lowStockCount++;
      }

      // Check expiry
      if (med.expiryDate) {
        const exp = new Date(med.expiryDate);
        if (exp < now) {
          expiredCount++;
        } else if (exp <= thirtyDaysFromNow) {
          expiringSoonCount++;
        }
      }
    }

    return {
      totalMedicines: medicines.length,
      totalStockUnits: roundQuantity(totalStockUnits),
      totalSellingValue: roundCurrency(totalSellingValue) ?? 0,
      totalCostValue: roundCurrency(totalCostValue) ?? 0,
      lowStockCount,
      expiringSoonCount,
      expiredCount,
    };
  }

  async getAlerts() {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const medicines = await this.prisma.medicine.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        name: true,
        genericName: true,
        brandName: true,
        quantity: true,
        minimumStock: true,
        expiryDate: true,
        rackLocation: true,
        batchNumber: true,
        onlinePurchaseUrl: true,
      },
      orderBy: { quantity: 'asc' },
    });

    const lowStockAlerts = [];
    const expiringSoonAlerts = [];
    const expiredAlerts = [];

    for (const med of medicines) {
      const isLow =
        med.minimumStock !== null && med.minimumStock !== undefined
          ? med.quantity <= med.minimumStock
          : med.quantity <= 0;

      if (isLow) {
        lowStockAlerts.push(med);
      }

      if (med.expiryDate) {
        const exp = new Date(med.expiryDate);
        if (exp < now) {
          expiredAlerts.push(med);
        } else if (exp <= thirtyDaysFromNow) {
          expiringSoonAlerts.push(med);
        }
      }
    }

    return {
      lowStockAlerts,
      expiringSoonAlerts,
      expiredAlerts,
    };
  }
}
