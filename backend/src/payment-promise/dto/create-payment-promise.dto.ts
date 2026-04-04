import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePaymentPromiseDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty()
  @IsNumber()
  total_debt!: number;

  @ApiProperty()
  @IsNumber()
  open_invoices_count!: number;

  @ApiProperty({ example: '2025-04-10' })
  @IsDateString()
  promised_payment_date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  promised_amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  service_report?: string;
}
