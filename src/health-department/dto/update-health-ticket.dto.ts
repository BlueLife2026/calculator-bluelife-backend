import { IsDateString, IsOptional, IsIn, IsString, MaxLength, IsObject } from 'class-validator';

export class UpdateHealthTicketDto {
  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsOptional()
  @IsIn(['NEW', 'IN_PROGRESS', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  estimateNumber?: string;

  @IsOptional()
  @IsIn(['PENDING', 'REQUIRED', 'NOT_REQUIRED'])
  estimateStatus?: string;

  @IsOptional()
  @IsObject()
  healthData?: Record<string, string>;
}
