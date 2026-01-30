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
  
  export class SearchRequestDtoInvoices {
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