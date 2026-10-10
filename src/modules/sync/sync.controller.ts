import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { SyncPushDto } from './dto/sync-push.dto';
import { SyncPullQueryDto } from './dto/sync-pull.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Synchronization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Synchronize a batch of pending client operations' })
  @ApiResponse({ status: 200, description: 'Batch operations processed' })
  async pushBatch(
    @Body() dto: SyncPushDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.syncService.processPushBatch(dto, userId);
  }

  @Get('pull')
  @ApiOperation({ summary: 'Pull server updates modified since cursor' })
  @ApiResponse({ status: 200, description: 'List of modified records with next cursor' })
  async pullUpdates(@Query() query: SyncPullQueryDto) {
    return this.syncService.pullUpdates(query);
  }
}
