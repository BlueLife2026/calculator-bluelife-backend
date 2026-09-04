import { Transform } from 'class-transformer';

import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateWaterBodyDto {
  @IsString()
  name: string;

  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : value,
  )
  @IsIn([
    'POOL',
    'SWIMMING_POOL',
    'SPA',
    'FOUNTAIN',
    'KIDDIE_POOL',
    'SPLASH_PAD',
    'DECORATIVE_WATER_FEATURE',
    'OTHER',
  ])
  type: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : value,
  )
  @IsIn(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'])
  size?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
