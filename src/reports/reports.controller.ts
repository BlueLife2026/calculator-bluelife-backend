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
import { ReportsService } from './reports.service';
import {
  CreateReportIncidentDto,
  UpdateReportIncidentDto,
} from './dto/report-incident.dto';
import { ReportOptionDto } from './dto/report-option.dto';
import { CreateReportUploadSessionDto } from './dto/report-attachment.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get() dashboard() {
    return this.reports.dashboard();
  }
  @Post('incidents') createIncident(@Body() data: CreateReportIncidentDto) {
    return this.reports.createIncident(data);
  }
  @Post('incidents/:id/attachments/sessions')
  createUploadSession(
    @Param('id') id: string,
    @Body() data: CreateReportUploadSessionDto,
  ) {
    return this.reports.createUploadSession(id, data);
  }

  @Post('incidents/:id/attachments/sessions/:sessionId/chunks')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3_276_800 } }))
  uploadChunk(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ) {
    if (!file) throw new BadRequestException('A file chunk is required.');
    return this.reports.uploadChunk(id, sessionId, file.buffer);
  }
  @Patch('incidents/:id') updateIncident(
    @Param('id') id: string,
    @Body() data: UpdateReportIncidentDto,
  ) {
    return this.reports.updateIncident(id, data);
  }
  @Delete('incidents/:id') deleteIncident(@Param('id') id: string) {
    return this.reports.deleteIncident(id);
  }
  @Post('config/:kind') createOption(
    @Param('kind') kind: string,
    @Body() data: ReportOptionDto,
  ) {
    return this.reports.createOption(kind, data);
  }
  @Patch('config/:kind/:id') updateOption(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() data: ReportOptionDto,
  ) {
    return this.reports.updateOption(kind, id, data);
  }
  @Delete('config/:kind/:id') deleteOption(
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.reports.deleteOption(kind, id);
  }
}
