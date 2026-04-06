import { Body, Controller, Get, Headers, Patch, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  CreateAgentDto,
  EmbedLoginDto,
  LoginAgentDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login por email e senha (agente)' })
  @ApiBody({ type: LoginAgentDto })
  login(@Body() dto: LoginAgentDto) {
    return this.authService.loginAgent(dto);
  }

  @Public()
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

  @Public()
  @Get('me')
  @ApiOperation({ summary: 'Retorna empresa/agente do token atual' })
  me(@Headers('authorization') authorization?: string) {
    return this.authService.me(authorization);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Atualiza o perfil do agente autenticado' })
  @ApiBody({ type: UpdateProfileDto })
  updateProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(authorization, dto);
  }
}
