import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class MarkCollectionResponseDto {
  @ApiProperty({ example: '4', description: 'Company account (Chatwoot account)' })
  @IsString()
  @MinLength(1)
  account!: string;

  @ApiProperty({ example: '5511999999999', description: 'Customer phone number' })
  @IsString()
  @MinLength(8)
  number!: string;

  @ApiProperty({
    required: false,
    example: '2026-03-08T15:30:00.000Z',
    description: 'When customer answered. Defaults to now.',
  })
  @IsOptional()
  @IsString()
  respondedAt?: string;
}

export class CollectionsMetricsResponseDto {
  @ApiProperty({ example: 120 })
  chargedCustomers30d!: number;

  @ApiProperty({ example: 44 })
  respondedAfterCharge30d!: number;

  @ApiProperty({ example: 36.7 })
  responseRate30d!: number;

  @ApiProperty({ example: 25 })
  openFollowups!: number;

  @ApiProperty({ example: 18 })
  noResponseOver24h!: number;

  @ApiProperty({ example: '2026-03-08T15:30:00.000Z', nullable: true })
  lastResponseAt!: string | null;
}
