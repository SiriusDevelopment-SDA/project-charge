import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
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
    example: 'less_than',
    enum: ['greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'],
    description: 'Operador da regua de cobranca',
  })
  @IsString()
  @IsIn(['greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'])
  operator!: 'greater_than' | 'less_than' | 'greater_or_equal' | 'less_or_equal';

  @ApiProperty({
    example: 30,
    required: false,
    description:
      'Compatibilidade com a regua antiga. Quando informado sozinho, vira o limite final do intervalo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  days?: number;

  @ApiProperty({
    example: 0,
    required: false,
    description: 'Inicio do intervalo em dias da regua de cobranca',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  daysFrom?: number;

  @ApiProperty({
    example: 30,
    required: false,
    description: 'Fim do intervalo em dias da regua de cobranca',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  daysTo?: number;

  @ApiProperty({
    example: '2026-04-15',
    required: false,
    description: 'Data de referencia da regua no formato YYYY-MM-DD',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  referenceDate?: string;

  @ApiProperty({
    example: ['2026-04-15', '2026-04-20'],
    description: 'Datas de referencia da regua no formato YYYY-MM-DD',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  referenceDates?: string[];
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
    description: 'Empresa usada para consultar clientes pela regua de cobranca',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty({
    type: () => InvoiceSearchFilterDto,
    required: false,
    description: 'Filtro opcional da regua para consulta no ERP',
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

export class InvoiceMapResultDto {
  @ApiProperty()
  invoice_id!: string;

  @ApiProperty()
  contract_id!: string;

  @ApiProperty({ nullable: true })
  invoice_due_date!: string | null;

  @ApiProperty()
  invoice_amount!: string;

  @ApiProperty({ enum: ['A Receber', 'Pago', 'Renegociado', 'Perdido'] })
  invoice_status!: 'A Receber' | 'Pago' | 'Renegociado' | 'Perdido';

  @ApiProperty({
    description: 'Indica se a fatura ja esta vencida',
    required: false,
  })
  overdue?: boolean;

  @ApiProperty()
  ticket_digitable_line!: string | null;

  @ApiProperty({ nullable: true })
  ticket_pdf_link!: string | null;

  @ApiProperty({ nullable: true })
  code_pix!: string | null;
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

  @ApiProperty({ required: false, nullable: true })
  dispatchDate?: string | null;

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

export class PixBatchRequestDto {
  // Opcional desde o B1: a empresa sai do token. O campo continua aceito para
  // nao quebrar o frontend, mas so vale se casar com a sessao.
  @ApiProperty({ example: 'uuid-da-empresa', required: false })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty({ example: ['12345', '67890'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  invoiceIds!: string[];
}

/**
 * Corpo de `POST /invoices/overdue-clients/search`.
 *
 * Estava inline no controller, como objeto literal — ou seja, sem
 * `class-validator`: `page`, `limit` e as faixas de filtro chegavam sem
 * nenhuma checagem e eram normalizadas na mao dentro do handler. Com o
 * `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`), o DTO
 * tambem passa a recusar campo que ninguem espera.
 *
 * `account` continua opcional: o escopo vem do token, e o corpo so pode
 * repetir o que ja esta la (ver `company-scope.ts`).
 */
export class SearchOverdueClientsDto {
  @ApiProperty({
    example: '900',
    required: false,
    description:
      'Conta da empresa. Precisa casar com a do token; super_admin pode indicar outra.',
  })
  @IsOptional()
  @IsString()
  account?: string;

  @ApiProperty({ example: 'joao', required: false })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({ example: 1, required: false, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  // Teto de 100 no DTO, o mesmo que o handler ja aplicava na mao: sem ele um
  // `limit` alto varre a base inteira numa requisicao.
  @ApiProperty({ example: 24, required: false, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({ example: 30, required: false, description: 'Dias de atraso, minimo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  agingMin?: number;

  @ApiProperty({ example: 60, required: false, description: 'Dias de atraso, maximo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  agingMax?: number;

  @ApiProperty({ example: 200, required: false, description: 'Divida em reais, minimo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  debtMin?: number;

  @ApiProperty({ example: 500, required: false, description: 'Divida em reais, maximo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  debtMax?: number;
}

export class InvoiceBatchPartialDto {
  @ApiProperty({ enum: ['partial'], example: 'partial' })
  status!: 'partial';

  @ApiProperty({
    example: 'Alguns clientes foram processados, outros apresentaram erro.',
  })
  message!: string;

  @ApiProperty({ type: [ResultInvoicesDto] })
  data!: ResultInvoicesDto[];

  @ApiProperty({ type: [InvoiceErrorDto], required: false })
  errors?: InvoiceErrorDto[];
}

