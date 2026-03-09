import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateAgentDto, EmbedLoginDto, LoginAgentDto } from './dto/auth.dto';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login por email e senha (agente)' })
  @ApiBody({ type: LoginAgentDto })
  login(@Body() dto: LoginAgentDto) {
    return this.authService.loginAgent(dto);
  }

  @Post('embed-login')
  @ApiOperation({ summary: 'Login embed por account e token' })
  @ApiBody({ type: EmbedLoginDto })
  embedLogin(@Body() dto: EmbedLoginDto) {
    return this.authService.loginEmbed(dto);
  }

  @Post('agents')
  @ApiOperation({ summary: 'Cria um agente vinculado a uma empresa' })
  @ApiBody({ type: CreateAgentDto })
  createAgent(@Body() dto: CreateAgentDto) {
    return this.authService.createAgent(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Retorna empresa/agente do token atual' })
  me(@Headers('authorization') authorization?: string) {
    return this.authService.me(authorization);
  }
}
