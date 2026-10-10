import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReceiptDto {
  @IsString()
  @IsNotEmpty({ message: 'Medicine ID is required' })
  medicineId: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Received quantity must be a valid number' })
  @Min(0.001, { message: 'Received quantity must be greater than 0' })
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Unit purchase cost must be a valid number' })
  @Min(0, { message: 'Unit purchase cost cannot be negative' })
  unitPurchaseCost?: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Expiry date must be a valid ISO date (YYYY-MM-DD)' })
  expiryDate?: string;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
