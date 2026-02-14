import { IsArray, IsString, ValidateNested } from 'class-validator';
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
  
  export class SearchRequestInvoicesDto {
    @ApiProperty({
      description: 'Lista de documentos (CPF/CNPJ)',
      type: () => CnpjCpfDto,
      isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CnpjCpfDto)
    documents!: CnpjCpfDto[];
  }
  class CodePixDto {
    @ApiProperty()
    status!: "success" | "error";
  
    @ApiProperty()
    pix!: string;
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
  