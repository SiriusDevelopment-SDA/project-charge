import { IsString, IsNumber, IsOptional, MinLength, IsBoolean } from 'class-validator';
// import { NameOrNumeroValidator } from '../utils/validations'
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SearchRequestDtoClients {

  @ApiProperty({
    description: 'Nome ou Whatsapp para buscar um cliente na api',
    example: '11999999999 ou Juliana Lima',
    required: false,
  })
  @IsString()
  query?: string
  
  @ApiProperty({
    description: 'Account é obrigatório, envie o id da account do sistema que está utilizando.',
    example: '4',
  })
  @Type(() => Number)
  @IsNumber()
  account!: number

  @ApiProperty({
    description: 'Envie uma page para filtrar para uma pagina específica.',
    example: '2',
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiProperty({
    description: 'Por questões de desempenho limitamos em 10 porêm pode ser enviado um novo limite a sua escolha.',
    example: '8',
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @ApiProperty({
    description: 'Envie true ou false para trazer as faturas vinculadas ao cliente.',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  relationInvoices?: boolean;

  @ApiProperty({
    description: 'Envie true ou false para trazer os serviços vinculados ao cliente.',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  relationService?: boolean;

  @ApiProperty({
    description: "Envie 'DESC' ou 'ASC' para odenar uma ordem de listagem.",
    example: 'DESC',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortorder?: 'ASC' | 'DESC'
}
