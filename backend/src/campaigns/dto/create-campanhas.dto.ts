import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsDateString,
  IsArray,
  ArrayNotEmpty,
  Matches,
  IsUUID,
  ValidateNested,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';
import { Client } from '../../clients/entities.ts/clients';
import { TemplateMapVar } from '../types';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';

export class InvoiceRuleDto {
  @ApiProperty({ enum: ['greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'] })
  @IsString()
  @IsIn(['greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'])
  operator!: 'greater_than' | 'less_than' | 'greater_or_equal' | 'less_or_equal';

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  daysFrom!: number;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(0)
  daysTo!: number;
}

export class CreateCampaignDto {
  @ApiProperty({ example: 'Campanha cobrança março' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  company!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  templateId!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;
  
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isEnabled!: boolean

  @ApiProperty({ example: '2026-03-10T12:00:00.000Z' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-03-11T12:00:00.000Z' })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dispatchTime!: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  @IsString()
  timezone!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  recurring!: boolean;

  @ApiProperty({ example: 'single', enum: ['single', 'range', 'monthly_days'], required: false })
  @IsOptional()
  @IsString()
  recurringType?: 'single' | 'range' | 'monthly_days';

  @ApiProperty({ example: ['2026-04-30', '2026-05-15'], required: false, type: [String] })
  @IsOptional()
  @IsArray()
  recurringDays?: Array<number | string>;

  @ApiProperty({ type: [String], example: ['client-id-1', 'client-id-2'] })
  @IsArray()
  @ArrayNotEmpty()
  clients!: string[];

  @ApiProperty({ type: [TemplateMapVar] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => TemplateMapVar)
  templateMapVars!: TemplateMapVar[];

  @ApiProperty({ type: () => InvoiceRuleDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceRuleDto)
  invoiceRule?: InvoiceRuleDto | null;
}

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}
