import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class SearchServicesDTO {
    @ApiProperty({
        description: 'envie o id da empresa',
        example: '123e4567-e89b-12d3-a456-426614174000',
    })
    @IsUUID('4', { message: 'companyId deve ser um UUID válido' })
    @IsString()
    companyId!: string;
}