// src/templates/dto/delete-template.dto.ts
import { IsUUID } from 'class-validator';

export class DeleteTemplateDto {
  @IsUUID()
  id!: string;
}
