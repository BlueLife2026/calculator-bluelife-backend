import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class AccessChemicalOwnerDto {
  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password: string;
}
