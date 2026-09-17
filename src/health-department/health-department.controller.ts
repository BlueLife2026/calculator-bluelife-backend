import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { HealthDepartmentService } from './health-department.service';
import { UpdateHealthTicketDto } from './dto/update-health-ticket.dto';
import { CreateHealthTicketCommentDto } from './dto/create-health-ticket-comment.dto';

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

  @Patch('tickets/:id')
  updateTicket(@Param('id') id: string, @Body() data: UpdateHealthTicketDto) {
    return this.health.updateTicket(id, data);
  }

  @Get('tickets/:id/comments')
  listComments(@Param('id') id: string) {
    return this.health.listComments(id);
  }

  @Post('tickets/:id/comments')
  createComment(@Param('id') id: string, @Body() data: CreateHealthTicketCommentDto) {
    return this.health.createComment(id, data);
  }

  @Get('status')
  integrationStatus() {
    return this.health.integrationStatus();
  }
}
