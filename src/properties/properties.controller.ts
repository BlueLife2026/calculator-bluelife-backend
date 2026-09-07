import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { CreateSalesActivityDto } from './dto/create-sales-activity.dto';
import { UpdateSalesActivityStatusDto } from './dto/update-sales-activity-status.dto';
import { UpdateSalesActivityDto } from './dto/update-sales-activity.dto';

@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
  ) {}

  @Get()
  findAll() {
    return this.propertiesService.findAll();
  }

  @Get('deleted')
  findDeleted() {
    return this.propertiesService.findDeleted();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Post()
  create(@Body() data: CreatePropertyDto) {
    return this.propertiesService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(id, data);
  }

  @Post(':id/sharepoint-folder')
  provisionSharePointFolder(@Param('id') id: string) {
    return this.propertiesService.provisionSharePointFolder(id);
  }

  @Post(':propertyId/water-bodies/:waterBodyId/photos')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadWaterBodyPhoto(
    @Param('propertyId') propertyId: string,
    @Param('waterBodyId') waterBodyId: string,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          originalname: string;
          mimetype: string;
        }
      | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('An image file is required.');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed.');
    }

    return this.propertiesService.uploadWaterBodyPhoto(
      propertyId,
      waterBodyId,
      file,
    );
  }

  @Post(':id/sales-activities')
  createSalesActivity(
    @Param('id') id: string,
    @Body() data: CreateSalesActivityDto,
  ) {
    return this.propertiesService.createSalesActivity(id, data);
  }

  @Patch(':propertyId/sales-activities/:activityId/status')
  updateSalesActivityStatus(
    @Param('propertyId') propertyId: string,
    @Param('activityId') activityId: string,
    @Body() data: UpdateSalesActivityStatusDto,
  ) {
    return this.propertiesService.updateSalesActivityStatus(
      propertyId,
      activityId,
      data.status,
    );
  }

  @Patch(':propertyId/sales-activities/:activityId')
  updateSalesActivity(
    @Param('propertyId') propertyId: string,
    @Param('activityId') activityId: string,
    @Body() data: UpdateSalesActivityDto,
  ) {
    return this.propertiesService.updateSalesActivity(propertyId, activityId, data);
  }

  @Delete(':propertyId/sales-activities/:activityId')
  deleteSalesActivity(
    @Param('propertyId') propertyId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.propertiesService.deleteSalesActivity(propertyId, activityId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.propertiesService.remove(id);
  }

  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.propertiesService.restore(id);
  }

  @Delete(':id/permanent')
  removePermanently(@Param('id') id: string) {
    return this.propertiesService.removePermanently(id);
  }
}
