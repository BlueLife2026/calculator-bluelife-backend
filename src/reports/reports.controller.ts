import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportIncidentDto, UpdateReportIncidentDto } from './dto/report-incident.dto';
import { ReportOptionDto } from './dto/report-option.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get() dashboard() { return this.reports.dashboard(); }
  @Post('incidents') createIncident(@Body() data: CreateReportIncidentDto) { return this.reports.createIncident(data); }
  @Patch('incidents/:id') updateIncident(@Param('id') id: string, @Body() data: UpdateReportIncidentDto) { return this.reports.updateIncident(id, data); }
  @Delete('incidents/:id') deleteIncident(@Param('id') id: string) { return this.reports.deleteIncident(id); }
  @Post('config/:kind') createOption(@Param('kind') kind: string, @Body() data: ReportOptionDto) { return this.reports.createOption(kind, data); }
  @Patch('config/:kind/:id') updateOption(@Param('kind') kind: string, @Param('id') id: string, @Body() data: ReportOptionDto) { return this.reports.updateOption(kind, id, data); }
  @Delete('config/:kind/:id') deleteOption(@Param('kind') kind: string, @Param('id') id: string) { return this.reports.deleteOption(kind, id); }
}
