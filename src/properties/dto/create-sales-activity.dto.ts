import { IsIn, IsString } from 'class-validator';

export class CreateSalesActivityDto {
  @IsIn(['PROPOSAL'])
  type: string;

  @IsString()
  notes: string;
}
