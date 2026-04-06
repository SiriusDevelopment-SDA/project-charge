import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { InteractionOutcome, InteractionType } from '../entities/client-interaction.entity';

export class CreateClientInteractionDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  company_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  agent_id?: string;

  @ApiPropertyOptional({ enum: ['call', 'whatsapp', 'email', 'visit', 'other'] })
  @IsOptional()
  @IsIn(['call', 'whatsapp', 'email', 'visit', 'other'])
  type?: InteractionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['payment_promise', 'no_contact', 'agreement', 'refused', 'other'] })
  @IsOptional()
  @IsIn(['payment_promise', 'no_contact', 'agreement', 'refused', 'other'])
  outcome?: InteractionOutcome;

  @ApiPropertyOptional({ example: '2025-04-10T10:00:00' })
  @IsOptional()
  @IsString()
  scheduled_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  payment_promise_id?: string;
}
