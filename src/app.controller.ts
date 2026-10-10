import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

@ApiTags('Health')
@Controller()
export class AppController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'API Health Check & Service Status' })
  getRoot() {
    return {
      status: 'online',
      service: 'Pharmacy Management Backend API',
      version: '1.0.0',
      docsUrl: '/api/v1/docs',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check probe for monitoring' })
  getHealth() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
