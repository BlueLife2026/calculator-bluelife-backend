import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function Quantity() {
  return Transform(({ value }) => Number(value));
}

export class CreateChemicalReportDto {
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  serviceDate: string;

  @IsString()
  @MaxLength(120)
  technicianName: string;

  @IsOptional()
  @IsUUID()
  technicianToken?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  waterBodyId?: string;

  @Quantity()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  tabsQuantity: number;

  @IsOptional()
  @IsIn(['units', 'pounds'])
  tabsUnit?: string;

  @Quantity()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  liquidChlorineGallons: number;

  @Quantity()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  muriaticAcidGallons: number;

  @Quantity()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  shockScoops: number;

  @Quantity()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  dePowderBags: number;

  @IsOptional()
  @IsIn(['bags', 'scoops'])
  dePowderUnit?: string;

  @Quantity()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  bicarbonateScoops: number;

  @Quantity()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  stabilizerScoops: number;

  @IsOptional()
  @IsIn(['bags', 'scoops'])
  stabilizerUnit?: string;

  @Quantity()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  saltBags: number;

  @Quantity()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  phosphatesOunces: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
