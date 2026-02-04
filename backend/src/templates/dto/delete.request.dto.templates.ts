// src/templates/dto/delete-template.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class DeleteTemplateDto {
  @ApiProperty({
    description: 'O id do template é obrigatório',
    example: "d8990525-54f3-4805-9da2-98d59449656e",
  })
  @IsUUID()
  @IsNotEmpty()
  templateId!: string;
}
