import { IsString, MinLength, IsNumber, Validate, IsOptional, isBoolean } from 'class-validator';
// import { NameOrNumeroValidator } from '../utils/validations'
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GetClientsDto {
  // @Validate(NameOrNumeroValidator)
  // private _nameOrNumeroCheck!: string;

  @ApiProperty({
    description: 'Nome serve para buscar um cliente na api',
    example: 'Juliana Lima',
  })
  @IsString()
  @IsOptional()
  name?: string;
  
  @ApiProperty({
    description: 'Whatsapp serve para buscar um cliente na api',
    example: '11999999999',
  })
  @IsOptional()
  @IsString()
  // @MinLength(11, {message: "whatsapp deve ter 11 dígitos ex: 11999999999"})
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
    description: 'Envie true ou false para trazer as faturas vinculadas ao cliente.',
    example: 'true',
  })
  @IsOptional()
  relationInvoices?: boolean

  @ApiProperty({
    description: 'Envie true ou false para trazer os serviços vinculados ao cliente.',
    example: 'false',
  })
  @IsOptional()
  relationService?: boolean

  @ApiProperty({
    description: "Envie 'DESC' ou 'ASC' para odenar uma ordem de listagem.",
    example: 'DESC',
  })
  @IsOptional()
  sortorder?: 'ASC' | 'DESC'
}
