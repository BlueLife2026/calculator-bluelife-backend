import { IsIn } from 'class-validator';

export class UpdateSalesActivityStatusDto {
  @IsIn(['CREATED', 'SENT', 'APPROVED', 'REJECTED'])
  status: 'CREATED' | 'SENT' | 'APPROVED' | 'REJECTED';
}
