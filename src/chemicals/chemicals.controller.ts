import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { ChemicalsService } from './chemicals.service';
import { CreateChemicalReportDto } from './dto/create-chemical-report.dto';

@Controller('chemicals')
export class ChemicalsController {
  constructor(private readonly chemicalsService: ChemicalsService) {}

  @Get('technicians')
  findTechnicians() {
    return this.chemicalsService.findTechnicians();
  }

  @Get('technicians/:id/whatsapp')
  async openTechnicianWhatsApp(
    @Param('id') id: string,
    @Query('formUrl') formUrl: string,
    @Res() response: Response,
  ) {
    response.redirect(
      await this.chemicalsService.technicianWhatsAppUrl(id, formUrl),
    );
  }

  @Get('technicians/resolve/:token')
  resolveTechnician(@Param('token') token: string) {
    return this.chemicalsService.resolveTechnician(token);
  }

  @Get('reports')
  findAll() {
    return this.chemicalsService.findAll();
  }

  @Get('reports/export')
  async export(@Res() response: Response) {
    const csv = await this.chemicalsService.exportCsv();
    const date = new Date().toISOString().slice(0, 10);
    response
      .type('text/csv; charset=utf-8')
      .attachment(`chemical-reports-${date}.csv`)
      .send(csv);
  }

  @Post('reports')
  create(@Body() data: CreateChemicalReportDto) {
    return this.chemicalsService.create(data);
  }
}
