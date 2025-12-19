import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString } from "class-validator";

export class SearchRequestDtoTemplates {
    @ApiProperty({
      description: 'Account é obrigatório, envie o id da account do sistema que está utilizando.',
      example: '4',
    })
    @Type(() => Number)
    @IsNumber()
    account!: number

    @ApiProperty({
        description: 'Para filtragens envie o nome do template',
        example: 'aviso de comaparecimento',
    })
    @IsString()
    query?: string;

    @ApiProperty({
        description: 'Envie uma page para filtrar para uma pagina específica.',
        example: '2',
    })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    page?: number;

    @ApiProperty({
        description: 'Por questões de desempenho limitamos em 10 porêm pode ser enviado um novo limite a sua escolha.',
        example: '8',
    })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    limit?: number;

    @ApiProperty({
    description: "Envie 'DESC' ou 'ASC' para odenar uma ordem de listagem.",
    example: 'DESC',
    })
    @IsOptional()
    sortorder?: 'ASC' | 'DESC'
}