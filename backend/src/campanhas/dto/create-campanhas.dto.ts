import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsDateString,
  IsArray,
  ArrayNotEmpty,
  Matches,
  IsUUID,
  IsOptional,
} from 'class-validator';
import { Client } from '../../clients/entities.ts/clients';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  company!: string;


  @IsUUID()
  @IsNotEmpty()
  templateId!: string;

  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dispatchStartTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dispatchEndTime!: string;

  @IsString()
  timezone!: string;

  @IsBoolean()
  recurring!: boolean;

  @IsArray()
  @ArrayNotEmpty()
  client!: Client[];
}
