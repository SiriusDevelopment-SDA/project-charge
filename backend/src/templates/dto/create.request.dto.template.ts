import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

class ComponentExampleDto {
  @IsArray()
  body_text!: string[];
}

class CreateComponentDto {
  @ApiProperty({ example: 'BODY', required: true })
  @IsString()
  type!: 'BODY' | 'HEADER' | 'FOOTER' | 'BUTTON' | 'BUTTONS';

  @ApiProperty({ example: 'TEXT', required: false, default: 'TEXT' })
  @IsString()
  @IsOptional()
  format?: string;

  @ApiProperty({ example: 'Bem vindo, {{1}}!', required: false })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiProperty({
    example: {
      body_text: ['template'],
    },
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ComponentExampleDto)
  example?: ComponentExampleDto;

  @ApiProperty({ example: "URL", required: false })
  @IsOptional()
  @IsString()
  sub_type?: string;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsNumber()
  index?: number;

  @ApiProperty({
    example: [{ type: "URL", text: "Pagar agora" }, { type: "ORDER_DETAILS", text: "Copy Pix code" }],
    required: false,
  })
  @IsOptional()
  @IsArray()
  buttons?: Record<string, any>[];

  @ApiProperty({ required: false, example: { link: "https://example.com/fatura.pdf" } })
  @IsOptional()
  @IsObject()
  document?: Record<string, any>;

  [key: string]: any;
}

class Variables {
  [key: string]: any;
}

export class CreateTemplateDTO {
  @ApiProperty({
    description: 'ID do template',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('4', { message: 'templateId deve ser um UUID válido' })
  @IsOptional()
  templateId?: string;

  @ApiProperty({
    description: 'envie o id da empresa',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('4', { message: 'templateId deve ser um UUID válido' })
  @IsString()
  companyId!: string;

  @ApiProperty({
    description: 'envie o nome do template',
    example: 'template_api',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'envie a linguagem do template',
    example: 'pt_BR',
    default: 'pt_BR'
  })
  @IsString()
  language!: string;

  @ApiProperty({
    description: 'Categoria do template',
    example: 'UTILITY'
  })
  @IsString()
  category!: string;

  @ApiProperty({
    description: 'Categoria exibida no sistema',
    example: 'Cobrança preventiva',
    required: false,
  })
  @IsOptional()
  @IsString()
  displayCategory?: string;

  @ApiProperty({
    description: 'Componentes do template',
    type: [CreateComponentDto],
    required: true
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateComponentDto)
  components!: CreateComponentDto[];

  @ApiProperty({
    description: 'envie as variaveis',
    example: { "1": "nome_cliente", "2": "valor_fatura" },
  })
  @IsObject()
  variables!: Variables

}


