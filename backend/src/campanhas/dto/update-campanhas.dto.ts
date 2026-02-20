import {
  IsString,
  IsBoolean,
  IsDateString,
  IsArray,
  Matches,
  IsUUID,
  IsOptional,
} from 'class-validator';

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dispatchStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dispatchEndTime?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @IsOptional()
  @IsArray()
  client?: string[];
}
