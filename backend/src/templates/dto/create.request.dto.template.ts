import { IsArray, IsEnum, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

class ComponentExampleDto {
  @IsArray()
  body_text!: string[];
}

class CreateComponentDto {
  @ApiProperty({ example: 'BODY', required: true })
  @IsString()
  type!: 'BODY' | 'HEADER' | 'FOOTER';

  @ApiProperty({ example: 'TEXT', required: false, default: 'TEXT' })
  @IsString()
  @IsOptional()
  format?: string;

  @ApiProperty({ example: 'Bem vindo, {{1}}!', required: true })
  @IsString()
  text!: string;

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
    example: ["nome_cliente, nome_empresa"],
  })
  @IsArray()
  variables!: Variables

}


