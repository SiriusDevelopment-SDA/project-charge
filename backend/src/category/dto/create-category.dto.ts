import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {

  @ApiProperty({ example: 'Cobrança' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsString()
  @IsNotEmpty()
  companyId!: string;
}
