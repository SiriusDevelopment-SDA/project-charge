import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AGENT_ROLES, type AgentRole } from '../../agents/entities/agent.entity';

export const PROMISE_REMINDER_TIMINGS = [
  'day_before',
  'same_day',
  'both',
] as const;

export type PromiseReminderTiming = (typeof PROMISE_REMINDER_TIMINGS)[number];

export class LoginAgentDto {
  @ApiProperty({ example: 'agente@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'senha-forte-123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class EmbedLoginDto {
  @ApiProperty({ example: '4' })
  @IsString()
  @IsNotEmpty()
  account!: string;

  @ApiProperty({ example: 'seu-token-embed' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class ChatwootLoginDto {
  @ApiProperty({ example: '3', description: 'account_chatwoot da empresa' })
  @IsString()
  @IsNotEmpty()
  account!: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiJ9...',
    description: 'user_access_token do agente no Chatwoot',
  })
  @IsString()
  @IsNotEmpty()
  chatwoot_token!: string;
}

export class CreateAgentDto {
  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'maria@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'senha-forte-123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    example: 'operator',
    required: false,
    enum: AGENT_ROLES,
  })
  @IsOptional()
  @IsString()
  role?: AgentRole;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class UpdateProfileDto {
  @ApiProperty({ example: 'Maria Silva', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({ example: 'senha-atual-123', required: false })
  @ValidateIf((dto) => dto.newPassword !== undefined)
  @IsString()
  @IsNotEmpty()
  currentPassword?: string;

  @ApiProperty({ example: 'nova-senha-forte-123', required: false, minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6)
  newPassword?: string;
}

export class UpdatePromiseAutomationSettingsDto {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @ApiProperty({
    example: 'day_before',
    required: false,
    enum: PROMISE_REMINDER_TIMINGS,
  })
  @IsOptional()
  @IsString()
  reminderTiming?: PromiseReminderTiming;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  autoBreakEnabled?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  checkPaymentBeforeBreak?: boolean;

  @ApiProperty({ example: 'uuid-template', required: false, nullable: true })
  @IsOptional()
  @IsString()
  reminderTemplateId?: string | null;

  @ApiProperty({ example: 'lembrete_pagamento_v1', required: false, nullable: true })
  @IsOptional()
  @IsString()
  reminderTemplateName?: string | null;
}

export class ManageAgentDto {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    example: 'operator',
    required: false,
    enum: AGENT_ROLES,
  })
  @IsOptional()
  @IsString()
  role?: AgentRole;

  @ApiProperty({ example: 'token-chatwoot-do-agente', required: false, nullable: true })
  @IsOptional()
  @IsString()
  chatwootAccessToken?: string | null;
}

export class ResetAgentPasswordDto {
  @ApiProperty({ example: 'nova-senha-forte-123', minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class UpdateChatwootConfigDto {
  @ApiProperty({ example: 'admin-token-da-account', required: false })
  @IsOptional()
  @IsString()
  chatwootAdminToken?: string;

  @ApiProperty({ example: '12', required: false, nullable: true })
  @IsOptional()
  @IsString()
  teamChargeId?: string | null;
}
