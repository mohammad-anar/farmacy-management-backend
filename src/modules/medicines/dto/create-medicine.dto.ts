import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsUrl,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMedicineDto {
  // === 3 MANDATORY FIELDS ===
  @IsString()
  @IsNotEmpty({ message: 'Medicine name is required' })
  name: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Selling price must be a valid number' })
  @Min(0, { message: 'Selling price cannot be negative' })
  sellingPrice: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Quantity must be a valid number' })
  @Min(0, { message: 'Quantity cannot be negative' })
  quantity: number;

  // === OPTIONAL FIELDS (All Nullable) ===
  @IsOptional()
  @IsString()
  genericName?: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  strength?: string;

  @IsOptional()
  @IsString()
  dosageForm?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Purchase price must be a valid number' })
  @Min(0, { message: 'Purchase price cannot be negative' })
  purchasePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Minimum stock threshold must be a valid number' })
  @Min(0, { message: 'Minimum stock threshold cannot be negative' })
  minimumStock?: number;

  @IsOptional()
  @IsString()
  rackLocation?: string;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Expiry date must be a valid ISO date string (YYYY-MM-DD)' })
  expiryDate?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Online purchase URL must be a valid web URL' })
  onlinePurchaseUrl?: string;
}
