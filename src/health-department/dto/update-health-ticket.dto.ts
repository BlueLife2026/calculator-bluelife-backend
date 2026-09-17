import { IsDateString, IsOptional, IsIn } from 'class-validator';

export class UpdateHealthTicketDto {
  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsOptional()
  @IsIn(['NEW', 'IN_PROGRESS', 'CLOSED'])
  status?: string;
}
