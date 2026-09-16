import { Controller, Get, Post } from '@nestjs/common';
import { HealthDepartmentService } from './health-department.service';

@Controller('health-department')
export class HealthDepartmentController {
  constructor(private readonly health: HealthDepartmentService) {}

  @Get('tickets')
  listTickets() {
    return this.health.listTickets();
  }

  @Post('sync')
  syncOutlook() {
    return this.health.syncOutlook();
  }

  @Get('status')
  integrationStatus() {
    return this.health.integrationStatus();
  }
}
