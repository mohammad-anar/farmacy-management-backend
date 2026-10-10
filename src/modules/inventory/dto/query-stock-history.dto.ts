import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryChangeType } from '@prisma/client';

export class QueryStockHistoryDto {
  @IsOptional()
  @IsString()
  medicineId?: string;

  @IsOptional()
  @IsEnum(InventoryChangeType)
  changeType?: InventoryChangeType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
