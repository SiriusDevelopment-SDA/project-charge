import { IsString, IsNumber, IsOptional, MinLength } from 'class-validator';
// import { NameOrNumeroValidator } from '../utils/validations'
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SearchRequestDtoClients {

  @ApiProperty({
    description: 'Nome serve para buscar um cliente na api',
    example: 'Juliana Lima',
    required: false,
  })
  @IsString()
  name?: string;
  
  @ApiProperty({
    description: 'Whatsapp serve para buscar um cliente na api',
    example: '11999999999',
    required: false,
  })
  @IsString()
  @MinLength(11, {message: "whatsapp deve ter 11 dígitos ex: 11999999999"})
  whatsapp?: string
  
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
    example: 'true',
    required: false,
  })
  relationInvoices?: boolean

  @ApiProperty({
    description: 'Envie true ou false para trazer os serviços vinculados ao cliente.',
    example: 'false',
    required: false,
  })
  relationService?: boolean

  @ApiProperty({
    description: "Envie 'DESC' ou 'ASC' para odenar uma ordem de listagem.",
    example: 'DESC',
    required: false,
  })
  sortorder?: 'ASC' | 'DESC'
}
