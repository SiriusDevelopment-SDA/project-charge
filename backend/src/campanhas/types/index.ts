import { IsString, IsOptional } from "class-validator";

export class TemplateMapVar {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  nome_cliente?: string;
  
  @IsOptional()
  @IsString()
  nome_atendente?: string;

  @IsString()
  cnpj_cpf!: string;

  @IsString()
  whatsapp!: string;

  @IsOptional()
  @IsString()
  mensagem?: string;

  @IsOptional()
  @IsString()
  data_vencimento_fatura?: string;;

  @IsOptional()
  @IsString()
  nome_empresa?: string;

  @IsOptional()
  @IsString()
  numero_contrato?: string;

  @IsOptional()
  @IsString()
  valor_fatura?: string;

  @IsOptional()
  @IsString()
  code_pix?: string;

  @IsOptional()
  @IsString()
  linha_digitavel_boleto?: string;

  @IsOptional()
  @IsString()
  link_boleto_pdf?: string;

  [key: string]: any;
}
