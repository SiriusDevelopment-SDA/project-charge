import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, ValidateNested } from "class-validator";

export class SearchRequestDtoTemplates {

    @ApiProperty({
      description: 'Account é obrigatório, envie o id da account do sistema que está utilizando.',
      example: 4,
    })
    @Type(() => Number)
    @IsNumber({}, { message: 'O account deve ser um número' })
    @IsNotEmpty({ message: 'O account é obrigatório' })
    account!: number;
  
    @ApiProperty({
      description: 'Para filtragens envie o nome do template',
      example: 'aviso de comparecimento',
      required: false,
    })
    @IsString()
    query?: string;
  
    @ApiProperty({
      description: 'Envie uma page para filtrar para uma pagina específica.',
      example: 2,
      required: false,
    })
    @Type(() => Number)
    @IsInt({ message: 'A page deve ser um número inteiro' })
    page!: number;
  
    @ApiProperty({
      description: 'Por questões de desempenho limitamos em 10 porém pode ser enviado um novo limite.',
      example: 8,
      required: false,
    })
    @Type(() => Number)
    @IsInt({ message: 'O limit deve ser um número inteiro' })
    limit!: number;
  
    @ApiProperty({
      description: "Envie 'DESC' ou 'ASC' para ordenar a listagem.",
      example: 'DESC',
      required: false,
    })
    @IsIn(['ASC', 'DESC'], { message: 'sortorder deve ser ASC ou DESC' })
    sortorder?: 'ASC' | 'DESC';
  }
  
export class TemplateParameterDto {
    @ApiProperty({ example: 'text', required: false })
    @IsString()
    type!: string;
  
    @ApiProperty({ example: 'João', required: false })
    @IsOptional()
    @IsString()
    text?: string;
    
    [key: string]: any;
}
  
export class TemplateComponentDto {
    @ApiProperty({ example: 'BODY', required: true })
    @IsString()
    type!: "BODY" | "HEADER" | "FOOTER";
  
    @ApiProperty({ type: [TemplateParameterDto], required: true })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TemplateParameterDto)
    parameters!: TemplateParameterDto[];
}

export class ToComponentDto {
  @ApiProperty({ example: 'João', required: false })
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Número de destino',
    example: '5511999999999',
  })
  @IsString()
  @Matches(/^\d{10,15}$/, {
    message: 'Número inválido, envie no formato DDI + número',
  })
  number!: string;

  @ApiProperty({
    description: 'Componentes do template',
    type: [TemplateComponentDto],
    required: true
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateComponentDto)
  components!: TemplateComponentDto[];
}
  
export class SendTemplateDto {
    @ApiProperty({
      description: 'ID do template',
      example: '123e4567-e89b-12d3-a456-426614174000',
    })
    @IsUUID('4', { message: 'templateId deve ser um UUID válido' })
    templateId!: string;
  
    @ApiProperty({
      description: 'ID da account do sistema',
      example: 4,
    })
    @IsNumber({}, { message: 'account deve ser um número' })
    @Type(() => Number)
    account!: number;
  
    @ApiProperty({
      description: 'Destino do disparo',
      type: [ToComponentDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ToComponentDto)
    to!: ToComponentDto[];
  }
  
  export class SearchRequestDtoRelatories {

    @ApiProperty({
      description: 'Account é obrigatório, envie o id da account do sistema que está utilizando.',
      example: 4,
    })
    @Type(() => Number)
    @IsNumber({}, { message: 'O account deve ser um número' })
    @IsNotEmpty({ message: 'O account é obrigatório' })
    account!: number;
  
    @ApiProperty({
      description: 'Nome ou Whatsapp para buscar um relatorio específico',
      example: '5511999999999 ou Juliana Lima',
      required: false,
    })
    @IsString()
    query?: string
  
    @ApiProperty({
      description: 'Envie uma page para filtrar para uma pagina específica.',
      example: 2,
      required: false,
    })
    @Type(() => Number)
    @IsInt({ message: 'A page deve ser um número inteiro' })
    page!: number;
  
    @ApiProperty({
      description: 'Por questões de desempenho limitamos em 10 porém pode ser enviado um novo limite.',
      example: 8,
      required: false,
    })
    @Type(() => Number)
    @IsInt({ message: 'O limit deve ser um número inteiro' })
    limit!: number;
  
    @ApiProperty({
      description: "Envie 'DESC' ou 'ASC' para ordenar a listagem.",
      example: 'DESC',
      required: false,
    })
    @IsIn(['ASC', 'DESC'], { message: 'sortorder deve ser ASC ou DESC' })
    sortorder?: 'ASC' | 'DESC';
  }
