import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const ACTIVITY_CATEGORIES = [
  'create',
  'edit',
  'delete',
  'execute',
  'auth',
  'other',
] as const;

export class SearchActivityLogDto {
  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ example: 50, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({ example: 'DESC', required: false, enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortorder?: 'ASC' | 'DESC';

  @ApiProperty({ example: 'joao', required: false, description: 'Busca por autor/ação/alvo' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({
    required: false,
    isArray: true,
    enum: ACTIVITY_CATEGORIES,
    description: 'Filtra por uma ou mais categorias. Vazio = todas.',
  })
  @IsOptional()
  @IsArray()
  @IsIn(ACTIVITY_CATEGORIES, { each: true })
  categories?: string[];

  @ApiProperty({ example: '2026-08-01', required: false })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiProperty({ example: '2026-08-31', required: false })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
