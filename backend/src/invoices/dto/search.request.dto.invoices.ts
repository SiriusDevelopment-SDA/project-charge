import {
  IsArray,
  Matches,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CnpjCpfDto {
  @ApiProperty({
    example: '444.444.444-84',
    description: 'CNPJ ou CPF do cliente',
  })
  @IsString()
  cnpj_cpf!: string;
}

export class InvoiceSearchFilterDto {
  @ApiProperty({
    example: 'greater_or_equal',
    enum: ['greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'],
    description: 'Operador da régua de cobrança',
  })
  @IsString()
  @IsIn(['greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'])
  operator!: 'greater_than' | 'less_than' | 'greater_or_equal' | 'less_or_equal';

  @ApiProperty({
    example: 5,
    description: 'Quantidade de dias usada na régua de cobrança',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days!: number;

  @ApiProperty({
    example: '2026-04-15',
    description: 'Data de referencia da regua no formato YYYY-MM-DD',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  referenceDate!: string;
}

export class SearchRequestInvoicesDto {
  @ApiProperty({
    description: 'Lista de documentos (CPF/CNPJ)',
    type: () => CnpjCpfDto,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CnpjCpfDto)
  documents?: CnpjCpfDto[];

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Empresa usada para consultar clientes pela régua de cobrança',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty({
    type: () => InvoiceSearchFilterDto,
    required: false,
    description: 'Filtro opcional para montar o grid_param da consulta no IXC',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceSearchFilterDto)
  filter?: InvoiceSearchFilterDto;
}

class InvoiceClientCompanyDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  account!: string;
}

export class InvoiceClientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clientId!: string;

  @ApiProperty()
  cnpj_cpf!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  whatsapp!: string;

  @ApiProperty({ required: false, nullable: true })
  email?: string | null;

  @ApiProperty({ type: InvoiceClientCompanyDto })
  company!: InvoiceClientCompanyDto;
}
class CodePixDto {
  @ApiProperty()
  status!: "success" | "error";

  @ApiProperty()
  pix!: string;

  @ApiProperty({ required: false })
  pix_key?: string;

  @ApiProperty({ required: false })
  pix_key_type?: string;
}
export class InvoiceMapResultDto {

  @ApiProperty()
  invoice_id!: string;

  @ApiProperty()
  contract_id!: string;

  @ApiProperty()
  invoice_due_date!: string;

  @ApiProperty()
  invoice_amount!: string;

  @ApiProperty({ enum: ['A Receber', 'Pago', 'Renegociado', 'Perdido'] })
  invoice_status!: 'A Receber' | 'Pago' | 'Renegociado' | 'Perdido';

  @ApiProperty({ description: 'indica se a fatura já está vencida', required: false })
  overdue?: boolean;

  @ApiProperty()
  ticket_digitable_line!: string | null;

  @ApiProperty({ nullable: true })
  ticket_pdf_link!: string | null;

  @ApiProperty({ nullable: true })
  code_pix!: CodePixDto;
}

export class InvoicesResponseDto {

  @ApiProperty({ enum: ['success', 'error'] })
  status!: 'success' | 'error';

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: [InvoiceMapResultDto] })
  list!: InvoiceMapResultDto[];
}
class InvoiceErrorDto {

  @ApiProperty()
  document!: string;

  @ApiProperty()
  reason!: string;
}

export class ResultInvoicesDto {
  @ApiProperty({ type: InvoiceClientDto })
  clientData!: InvoiceClientDto;

  @ApiProperty()
  client!: string;

  @ApiProperty()
  document!: string;

  @ApiProperty()
  erp!: string;

  @ApiProperty({ type: InvoicesResponseDto })
  invoices!: InvoicesResponseDto;
}

export class InvoiceBatchResponseDto {

  @ApiProperty({ enum: ['success', 'partial', 'error'] })
  status!: 'success' | 'partial' | 'error';

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: [ResultInvoicesDto] })
  data!: ResultInvoicesDto[];

  @ApiProperty({ type: [InvoiceErrorDto], required: false })
  errors?: InvoiceErrorDto[];
}
export class InvoiceBatchPartialDto {

  @ApiProperty({ enum: ['partial'], example: 'partial' })
  status!: 'partial';

  @ApiProperty({ example: 'Alguns clientes foram processados, outros apresentaram erro.' })
  message!: string;

  @ApiProperty({ type: [ResultInvoicesDto] })
  data!: ResultInvoicesDto[];

  @ApiProperty({ type: [InvoiceErrorDto], required: false })
  errors?: InvoiceErrorDto[];
}

export class InvoiceOverdueDto {
  @ApiProperty()
  invoice_due_date!: string;

  @ApiProperty({ enum: ['A Receber', 'Pago', 'Renegociado', 'Perdido'] })
  invoice_status!: 'A Receber' | 'Pago' | 'Renegociado' | 'Perdido';

  @ApiProperty({ example: true })
  overdue!: boolean;
}

export class InvoicesOverdueResponseDto {
  @ApiProperty({ enum: ['success', 'error'] })
  status!: 'success' | 'error';

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: [InvoiceOverdueDto] })
  list!: InvoiceOverdueDto[];
  length: any;
}

export class ResultInvoicesOverdueDto { 
  @ApiProperty()
  client!: string;

  @ApiProperty()
  document!: string;

  @ApiProperty()
  erp!: string;

  @ApiProperty({ type: InvoicesOverdueResponseDto })
  invoices!: InvoicesOverdueResponseDto
}
