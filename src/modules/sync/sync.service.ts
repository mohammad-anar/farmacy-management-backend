import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncOperationDto, SyncOperationType, SyncPushDto } from './dto/sync-push.dto';
import { SyncPullQueryDto } from './dto/sync-pull.dto';
import { roundQuantity, roundCurrency } from '../../common/utils/precision.util';
import { InventoryChangeType } from '@prisma/client';

export interface OperationResult {
  operationId: string;
  success: boolean;
  entityId: string;
  clientId?: string;
  serverId?: string;
  record?: any;
  error?: string;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Process a batch of pending client operations idempotently
   */
  async processPushBatch(dto: SyncPushDto, userId: string): Promise<{ results: OperationResult[] }> {
    const results: OperationResult[] = [];

    for (const op of dto.operations) {
      try {
        // 1. Idempotency check: Has this operation already been processed?
        const existingOp = await this.prisma.processedSyncOperation.findUnique({
          where: { clientOperationId: op.operationId },
        });

        if (existingOp) {
          this.logger.log(`Idempotent skip: Operation ${op.operationId} was already processed.`);
          results.push(JSON.parse(existingOp.result));
          continue;
        }

        // 2. Process based on operation type
        let opResult: OperationResult;
        switch (op.operationType) {
          case SyncOperationType.CREATE_MEDICINE:
            opResult = await this.handleCreateMedicine(op, userId);
            break;
          case SyncOperationType.UPDATE_MEDICINE:
            opResult = await this.handleUpdateMedicine(op);
            break;
          case SyncOperationType.DELETE_MEDICINE:
            opResult = await this.handleDeleteMedicine(op);
            break;
          case SyncOperationType.ADJUST_STOCK:
            opResult = await this.handleAdjustStock(op, userId);
            break;
          case SyncOperationType.RECEIVE_STOCK:
            opResult = await this.handleReceiveStock(op, userId);
            break;
          default:
            opResult = {
              operationId: op.operationId,
              success: false,
              entityId: op.entityId,
              clientId: op.clientId,
              error: `Unsupported operation type: ${op.operationType}`,
            };
        }

        // 3. Cache result for idempotency
        await this.prisma.processedSyncOperation.create({
          data: {
            clientOperationId: op.operationId,
            operationType: op.operationType,
            entityType: op.entityType,
            entityId: op.entityId,
            result: JSON.stringify(opResult),
          },
        });

        results.push(opResult);
      } catch (error: any) {
        this.logger.error(`Error processing sync operation ${op.operationId}:`, error);
        results.push({
          operationId: op.operationId,
          success: false,
          entityId: op.entityId,
          clientId: op.clientId,
          error: error.message || 'Internal processing error',
        });
      }
    }

    return { results };
  }

  /**
   * Pull server updates modified since client cursor
   */
  async pullUpdates(query: SyncPullQueryDto): Promise<{
    items: any[];
    serverCursor: string;
    hasMore: boolean;
  }> {
    const { cursor, limit = 100 } = query;
    const filter: any = {};

    if (cursor) {
      filter.updatedAt = { gt: new Date(cursor) };
    }

    const items = await this.prisma.medicine.findMany({
      where: filter,
      include: {
        batches: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: limit + 1,
    });

    const hasMore = items.length > limit;
    const returnItems = hasMore ? items.slice(0, limit) : items;
    const lastItem = returnItems[returnItems.length - 1];
    const serverCursor = lastItem ? lastItem.updatedAt.toISOString() : (cursor || new Date().toISOString());

    return {
      items: returnItems,
      serverCursor,
      hasMore,
    };
  }

  private async handleCreateMedicine(op: SyncOperationDto, userId: string): Promise<OperationResult> {
    const payload = op.payload;
    const sellingPrice = roundCurrency(payload.sellingPrice);
    const quantity = roundQuantity(payload.quantity);
    const trimmedName = payload.name.trim();

    // Check if active medicine with this exact name already exists on backend
    const existing = await this.prisma.medicine.findFirst({
      where: {
        name: { equals: trimmedName, mode: 'insensitive' },
        isDeleted: false,
      },
    });

    let created;
    if (existing) {
      created = await this.prisma.medicine.update({
        where: { id: existing.id },
        data: {
          sellingPrice: sellingPrice || existing.sellingPrice,
          quantity: quantity !== undefined ? quantity : existing.quantity,
          genericName: payload.genericName ? payload.genericName.trim() : existing.genericName,
          brandName: payload.brandName ? payload.brandName.trim() : existing.brandName,
          manufacturer: payload.manufacturer ? payload.manufacturer.trim() : existing.manufacturer,
          strength: payload.strength ? payload.strength.trim() : existing.strength,
          dosageForm: payload.dosageForm ? payload.dosageForm.trim() : existing.dosageForm,
          category: payload.category ? payload.category.trim() : existing.category,
          barcode: payload.barcode ? payload.barcode.trim() : existing.barcode,
          purchasePrice: payload.purchasePrice !== undefined && payload.purchasePrice !== null ? roundCurrency(payload.purchasePrice) : existing.purchasePrice,
          minimumStock: payload.minimumStock !== undefined && payload.minimumStock !== null ? roundQuantity(payload.minimumStock) : existing.minimumStock,
          rackLocation: payload.rackLocation ? payload.rackLocation.trim() : existing.rackLocation,
          supplierName: payload.supplierName ? payload.supplierName.trim() : existing.supplierName,
          batchNumber: payload.batchNumber ? payload.batchNumber.trim() : existing.batchNumber,
          expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : existing.expiryDate,
          imageUrl: payload.imageUrl || existing.imageUrl,
          notes: payload.notes || existing.notes,
          onlinePurchaseUrl: payload.onlinePurchaseUrl || existing.onlinePurchaseUrl,
        },
        include: { batches: true },
      });
    } else {
      created = await this.prisma.medicine.create({
        data: {
          name: trimmedName,
          sellingPrice,
          quantity,
          genericName: payload.genericName ? payload.genericName.trim() : null,
          brandName: payload.brandName ? payload.brandName.trim() : null,
          manufacturer: payload.manufacturer ? payload.manufacturer.trim() : null,
          strength: payload.strength ? payload.strength.trim() : null,
          dosageForm: payload.dosageForm ? payload.dosageForm.trim() : null,
          category: payload.category ? payload.category.trim() : null,
          barcode: payload.barcode ? payload.barcode.trim() : null,
          purchasePrice: payload.purchasePrice !== undefined && payload.purchasePrice !== null ? roundCurrency(payload.purchasePrice) : null,
          minimumStock: payload.minimumStock !== undefined && payload.minimumStock !== null ? roundQuantity(payload.minimumStock) : null,
          rackLocation: payload.rackLocation ? payload.rackLocation.trim() : null,
          supplierName: payload.supplierName ? payload.supplierName.trim() : null,
          batchNumber: payload.batchNumber ? payload.batchNumber.trim() : null,
          expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : null,
          imageUrl: payload.imageUrl || null,
          notes: payload.notes || null,
          onlinePurchaseUrl: payload.onlinePurchaseUrl || null,
        },
        include: { batches: true },
      });

      // Record initial stock movement
      if (quantity > 0) {
        await this.prisma.stockHistory.create({
          data: {
            medicineId: created.id,
            userId,
            changeType: InventoryChangeType.INITIAL_STOCK,
            quantityBefore: 0,
            quantityChanged: quantity,
            quantityAfter: quantity,
            batchNumber: created.batchNumber,
            unitPurchaseCost: created.purchasePrice,
            reason: 'Initial stock on creation (offline sync)',
          },
        });
      }
    }

    return {
      operationId: op.operationId,
      success: true,
      entityId: op.entityId,
      clientId: op.clientId || op.entityId,
      serverId: created.id,
      record: created,
    };
  }


  /**
   * Helper to safely find a medicine by ObjectId, client entity ID, or name
   */
  private async resolveMedicine(entityId: string, payload?: any): Promise<any> {
    if (!entityId) return null;

    // 1. If valid 24-character hexadecimal ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(entityId)) {
      const med = await this.prisma.medicine.findUnique({
        where: { id: entityId },
      });
      if (med) return med;
    }

    // 2. Check if this client ID was mapped to a server ID in a previous CREATE_MEDICINE operation
    const previousCreate = await this.prisma.processedSyncOperation.findFirst({
      where: {
        entityId,
        operationType: SyncOperationType.CREATE_MEDICINE,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (previousCreate) {
      try {
        const parsed = JSON.parse(previousCreate.result);
        if (parsed?.serverId && /^[0-9a-fA-F]{24}$/.test(parsed.serverId)) {
          const med = await this.prisma.medicine.findUnique({
            where: { id: parsed.serverId },
          });
          if (med) return med;
        }
      } catch {}
    }

    // 3. Fallback: match by medicine name if provided
    if (payload?.name) {
      const medByName = await this.prisma.medicine.findFirst({
        where: {
          name: { equals: payload.name.trim(), mode: 'insensitive' },
          isDeleted: false,
        },
      });
      if (medByName) return medByName;
    }

    return null;
  }

  private async handleUpdateMedicine(op: SyncOperationDto): Promise<OperationResult> {
    const payload = op.payload;
    const targetId = op.entityId;

    const existing = await this.resolveMedicine(targetId, payload);

    if (!existing) {
      return {
        operationId: op.operationId,
        success: false,
        entityId: targetId,
        error: `Medicine ${targetId} not found on server`,
      };
    }

    const updateData: any = {};
    if (payload.name !== undefined) updateData.name = payload.name.trim();
    if (payload.sellingPrice !== undefined) updateData.sellingPrice = roundCurrency(payload.sellingPrice);
    if (payload.genericName !== undefined) updateData.genericName = payload.genericName ? payload.genericName.trim() : null;
    if (payload.brandName !== undefined) updateData.brandName = payload.brandName ? payload.brandName.trim() : null;
    if (payload.manufacturer !== undefined) updateData.manufacturer = payload.manufacturer ? payload.manufacturer.trim() : null;
    if (payload.strength !== undefined) updateData.strength = payload.strength ? payload.strength.trim() : null;
    if (payload.dosageForm !== undefined) updateData.dosageForm = payload.dosageForm ? payload.dosageForm.trim() : null;
    if (payload.category !== undefined) updateData.category = payload.category ? payload.category.trim() : null;
    if (payload.barcode !== undefined) updateData.barcode = payload.barcode ? payload.barcode.trim() : null;
    if (payload.purchasePrice !== undefined) updateData.purchasePrice = payload.purchasePrice !== null ? roundCurrency(payload.purchasePrice) : null;
    if (payload.minimumStock !== undefined) updateData.minimumStock = payload.minimumStock !== null ? roundQuantity(payload.minimumStock) : null;
    if (payload.rackLocation !== undefined) updateData.rackLocation = payload.rackLocation ? payload.rackLocation.trim() : null;
    if (payload.supplierName !== undefined) updateData.supplierName = payload.supplierName ? payload.supplierName.trim() : null;
    if (payload.batchNumber !== undefined) updateData.batchNumber = payload.batchNumber ? payload.batchNumber.trim() : null;
    if (payload.expiryDate !== undefined) updateData.expiryDate = payload.expiryDate ? new Date(payload.expiryDate) : null;
    if (payload.imageUrl !== undefined) updateData.imageUrl = payload.imageUrl || null;
    if (payload.notes !== undefined) updateData.notes = payload.notes || null;
    if (payload.onlinePurchaseUrl !== undefined) updateData.onlinePurchaseUrl = payload.onlinePurchaseUrl || null;

    const updated = await this.prisma.medicine.update({
      where: { id: existing.id },
      data: updateData,
      include: { batches: true },
    });

    return {
      operationId: op.operationId,
      success: true,
      entityId: targetId,
      clientId: op.clientId || targetId,
      serverId: updated.id,
      record: updated,
    };
  }

  private async handleDeleteMedicine(op: SyncOperationDto): Promise<OperationResult> {
    const targetId = op.entityId;
    const existing = await this.resolveMedicine(targetId, op.payload);

    if (!existing) {
      return {
        operationId: op.operationId,
        success: true, // Idempotent: already deleted/missing
        entityId: targetId,
        clientId: op.clientId || targetId,
      };
    }

    await this.prisma.medicine.update({
      where: { id: existing.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return {
      operationId: op.operationId,
      success: true,
      entityId: targetId,
      clientId: op.clientId || targetId,
      serverId: existing.id,
    };
  }

  private async handleAdjustStock(op: SyncOperationDto, userId: string): Promise<OperationResult> {
    const { delta, reason, changeType } = op.payload;
    const targetId = op.entityId;

    const med = await this.resolveMedicine(targetId, op.payload);

    if (!med) {
      return {
        operationId: op.operationId,
        success: false,
        entityId: targetId,
        clientId: op.clientId || targetId,
        error: `Medicine ${targetId} not found`,
      };
    }

    const qtyBefore = med.quantity;
    const qtyChange = roundQuantity(delta);
    const qtyAfter = Math.max(0, roundQuantity(qtyBefore + qtyChange));

    const updated = await this.prisma.medicine.update({
      where: { id: med.id },
      data: { quantity: qtyAfter },
    });

    await this.prisma.stockHistory.create({
      data: {
        medicineId: med.id,
        userId,
        changeType: (changeType as InventoryChangeType) || InventoryChangeType.STOCK_ADJUSTMENT,
        quantityBefore: qtyBefore,
        quantityChanged: qtyChange,
        quantityAfter: qtyAfter,
        reason: reason || 'Offline stock adjustment sync',
      },
    });

    return {
      operationId: op.operationId,
      success: true,
      entityId: targetId,
      clientId: op.clientId || targetId,
      serverId: updated.id,
      record: updated,
    };
  }

  private async handleReceiveStock(op: SyncOperationDto, userId: string): Promise<OperationResult> {
    const { quantity, batchNumber, expiryDate, purchasePrice, reason, supplierName } = op.payload;
    const targetId = op.entityId;

    const med = await this.resolveMedicine(targetId, op.payload);

    if (!med) {
      return {
        operationId: op.operationId,
        success: false,
        entityId: targetId,
        clientId: op.clientId || targetId,
        error: `Medicine ${targetId} not found`,
      };
    }

    const qtyBefore = med.quantity;
    const qtyReceived = roundQuantity(quantity);
    const qtyAfter = roundQuantity(qtyBefore + qtyReceived);

    const updated = await this.prisma.medicine.update({
      where: { id: med.id },
      data: {
        quantity: qtyAfter,
        ...(supplierName ? { supplierName: supplierName.trim() } : {}),
      },
    });

    if (batchNumber) {
      const existingBatch = await this.prisma.batch.findFirst({
        where: { medicineId: med.id, batchNumber: batchNumber.trim() },
      });

      if (existingBatch) {
        await this.prisma.batch.update({
          where: { id: existingBatch.id },
          data: {
            quantity: roundQuantity(existingBatch.quantity + qtyReceived),
            ...(expiryDate ? { expiryDate: new Date(expiryDate) } : {}),
            ...(purchasePrice !== undefined && purchasePrice !== null ? { purchasePrice: roundCurrency(purchasePrice) } : {}),
          },
        });
      } else {
        await this.prisma.batch.create({
          data: {
            medicineId: med.id,
            batchNumber: batchNumber.trim(),
            quantity: qtyReceived,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            purchasePrice: purchasePrice !== undefined && purchasePrice !== null ? roundCurrency(purchasePrice) : null,
          },
        });
      }
    }

    await this.prisma.stockHistory.create({
      data: {
        medicineId: med.id,
        userId,
        changeType: InventoryChangeType.STOCK_RECEIVED,
        quantityBefore: qtyBefore,
        quantityChanged: qtyReceived,
        quantityAfter: qtyAfter,
        batchNumber: batchNumber ? batchNumber.trim() : null,
        unitPurchaseCost: purchasePrice !== undefined && purchasePrice !== null ? roundCurrency(purchasePrice) : null,
        reason: reason || (supplierName ? `Received from ${supplierName}` : 'Stock received (offline sync)'),
      },
    });

    return {
      operationId: op.operationId,
      success: true,
      entityId: targetId,
      clientId: op.clientId || targetId,
      serverId: updated.id,
      record: updated,
    };
  }
}
