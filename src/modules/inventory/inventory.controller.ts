import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { QueryExpiringDto } from './dto/query-expiring.dto';
import { QueryStockHistoryDto } from './dto/query-stock-history.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('low-stock')
  @ApiOperation({ summary: 'Get list of medicines with stock at or below minimum threshold' })
  async getLowStock() {
    return this.inventoryService.getLowStock();
  }

  @Get('expiring')
  @ApiOperation({ summary: 'Get expired and expiring medicines within a days window (default: 30)' })
  async getExpiring(@Query() query: QueryExpiringDto) {
    return this.inventoryService.getExpiring(query.days);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get paginated inventory change history logs' })
  async getHistory(@Query() query: QueryStockHistoryDto) {
    return this.inventoryService.getHistory(query);
  }

  @Post('receipts')
  @ApiOperation({ summary: 'Record received stock delivery from supplier/distributor' })
  @HttpCode(HttpStatus.CREATED)
  async recordReceipt(
    @Body() receiptDto: CreateReceiptDto,
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return this.inventoryService.recordReceipt(receiptDto, user.userId);
  }

  @Post('adjustments')
  @ApiOperation({ summary: 'Record manual inventory adjustment/correction or write-off' })
  @HttpCode(HttpStatus.OK)
  async recordAdjustment(
    @Body() adjustmentDto: CreateAdjustmentDto,
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return this.inventoryService.recordAdjustment(adjustmentDto, user.userId);
  }
}
