import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export enum SyncOperationType {
  CREATE_MEDICINE = 'CREATE_MEDICINE',
  UPDATE_MEDICINE = 'UPDATE_MEDICINE',
  DELETE_MEDICINE = 'DELETE_MEDICINE',
  ADJUST_STOCK = 'ADJUST_STOCK',
  RECEIVE_STOCK = 'RECEIVE_STOCK',
}

export enum SyncEntityType {
  MEDICINE = 'MEDICINE',
  STOCK = 'STOCK',
  BATCH = 'BATCH',
}

export class SyncOperationDto {
  @ApiProperty({ description: 'Client-generated unique operation UUID' })
  @IsString()
  @IsNotEmpty()
  operationId: string;

  @ApiProperty({ enum: SyncOperationType })
  @IsEnum(SyncOperationType)
  operationType: SyncOperationType;

  @ApiProperty({ enum: SyncEntityType })
  @IsEnum(SyncEntityType)
  entityType: SyncEntityType;

  @ApiProperty({ description: 'Entity client or server ID' })
  @IsString()
  @IsNotEmpty()
  entityId: string;

  @ApiPropertyOptional({ description: 'Stable client entity ID for local creates' })
  @IsString()
  @IsOptional()
  clientId?: string;

  @ApiProperty({ description: 'Operation payload' })
  @IsNotEmpty()
  payload: any;
}

export class SyncPushDto {
  @ApiProperty({ type: [SyncOperationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}
