import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';
import { HealthDepartmentController } from './health-department.controller';
import { HealthDepartmentService } from './health-department.service';
import { InspectionRemindersService } from './inspection-reminders.service';

@Module({
  imports: [PrismaModule],
  controllers: [HealthDepartmentController],
  providers: [HealthDepartmentService, MicrosoftGraphService, InspectionRemindersService],
})
export class HealthDepartmentModule {}
