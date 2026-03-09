import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class ChatwootConversationsQueryDto {
  @ApiProperty()
  @IsString()
  account!: string;

  @ApiPropertyOptional({ enum: ['all', 'open', 'resolved', 'pending', 'snoozed'], default: 'open' })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'open', 'resolved', 'pending', 'snoozed'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inboxIdentifier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  _ts?: string;
}

export class ChatwootAccountQueryDto {
  @ApiProperty()
  @IsString()
  account!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inboxIdentifier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactIdentifier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  _ts?: string;
}

export class ChatwootConversationParamDto {
  @ApiProperty()
  @IsInt()
  id!: number;
}

export class ChatwootConversationQueryDto {
  @ApiProperty()
  @IsString()
  account!: string;
}

export class ChatwootSendMessageDto {
  @ApiProperty()
  @IsString()
  content!: string;
}

export class ChatwootAssignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  assigneeId?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  teamId?: number | null;
}

export class ChatwootStatusDto {
  @ApiProperty({ enum: ['open', 'resolved', 'pending', 'snoozed'] })
  @IsString()
  @IsIn(['open', 'resolved', 'pending', 'snoozed'])
  status!: 'open' | 'resolved' | 'pending' | 'snoozed';
}

export class ChatwootLabelsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  labels!: string[];
}
