import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MedicinesService } from './medicines.service';
import { CreateMedicineDto } from './dto/create-medicine.dto';
import { UpdateMedicineDto } from './dto/update-medicine.dto';
import { QueryMedicineDto } from './dto/query-medicine.dto';
import { SearchMedicineDto } from './dto/search-medicine.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Medicines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('medicines')
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new medicine record' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createMedicineDto: CreateMedicineDto,
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return this.medicinesService.create(createMedicineDto, user.userId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search medicines by keyword q (name, generic, brand, barcode, etc.)' })
  async search(@Query() searchDto: SearchMedicineDto) {
    return this.medicinesService.search(searchDto.q, searchDto.page, searchDto.limit);
  }

  @Get()
  @ApiOperation({ summary: 'List medicines with pagination, filters and sorting' })
  async findAll(@Query() query: QueryMedicineDto) {
    return this.medicinesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single medicine details by ObjectId' })
  async findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.medicinesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update medicine details by ObjectId' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateMedicineDto: UpdateMedicineDto,
  ) {
    return this.medicinesService.update(id, updateMedicineDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete/archive medicine record' })
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.medicinesService.remove(id);
  }
}
