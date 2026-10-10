import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryChangeType } from '@prisma/client';

export class CreateAdjustmentDto {
  @IsString()
  @IsNotEmpty({ message: 'Medicine ID is required' })
  medicineId: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Quantity change must be a valid number' })
  quantityChange: number;

  @IsEnum(
    [
      InventoryChangeType.STOCK_ADJUSTMENT,
      InventoryChangeType.STOCK_CORRECTION,
      InventoryChangeType.DAMAGED_EXPIRED,
      InventoryChangeType.RETURN_TO_SUPPLIER,
    ],
    {
      message:
        'Change type must be one of: STOCK_ADJUSTMENT, STOCK_CORRECTION, DAMAGED_EXPIRED, RETURN_TO_SUPPLIER',
    },
  )
  @IsNotEmpty({ message: 'Adjustment change type is required' })
  changeType: InventoryChangeType;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
