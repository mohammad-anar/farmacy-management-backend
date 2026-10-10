import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryExpiringDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number = 30;
}
