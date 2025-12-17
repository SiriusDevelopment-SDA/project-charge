import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsNumber, ValidateIf, Validate } from 'class-validator';
import { NameOrNumeroValidator } from '../utils/validations'
import { Type } from 'class-transformer';

export class GetClientsDto {
  @Validate(NameOrNumeroValidator)
  private _nameOrNumeroCheck!: string;

  @IsString()
  name?: string;
  
  @IsString()
  @MinLength(11, {message: "número deve ter 11 dígitos ex: 11999999999"})
  numero?: string
  
  @Type(() => Number)
  @IsNumber()
  account!: number
}
