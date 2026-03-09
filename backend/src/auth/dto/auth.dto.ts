import { IsEmail, IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  companyId!: string;
}
