import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  ChatwootLoginDto,
  CreateAgentDto,
  EmbedLoginDto,
  LoginAgentDto,
  ManageAgentDto,
  UpdateChatwootConfigDto,
  UpdatePromiseAutomationSettingsDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';
import { SuperAdminGuard } from './guards/super-admin.guard';
import type { AgentRole } from '../agents/entities/agent.entity';

type AuthedRequest = {
  user?: {
    sub?: string;
    agentId?: string;
    agentRole?: AgentRole;
    agentActive?: boolean;
  };
};

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

  @Public()
  @Post('chatwoot-login')
  @ApiOperation({
    summary:
      'Login via Chatwoot — valida o user_access_token contra a API do Chatwoot e faz upsert do agente',
  })
  @ApiBody({ type: ChatwootLoginDto })
  chatwootLogin(@Body() dto: ChatwootLoginDto) {
    return this.authService.loginChatwoot(dto);
  }

  @Post('agents')
  @ApiOperation({ summary: 'Cria um agente vinculado a uma empresa' })
  @ApiBody({ type: CreateAgentDto })
  createAgent(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateAgentDto,
  ) {
    return this.authService.createAgent(authorization, dto);
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

  @Get('me/team')
  @ApiOperation({ summary: 'Lista os agentes da empresa autenticada' })
  listTeam(@Headers('authorization') authorization?: string) {
    return this.authService.listCompanyAgents(authorization);
  }

  @Post('me/team')
  @ApiOperation({ summary: 'Cria um agente na empresa autenticada' })
  @ApiBody({ type: CreateAgentDto })
  createTeamAgent(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateAgentDto,
  ) {
    return this.authService.createAgent(authorization, dto);
  }

  @Patch('agents/:agentId')
  @ApiOperation({ summary: 'Atualiza role ou status de acesso de um agente da empresa autenticada' })
  @ApiBody({ type: ManageAgentDto })
  manageAgent(
    @Headers('authorization') authorization: string | undefined,
    @Param('agentId') agentId: string,
    @Body() dto: ManageAgentDto,
  ) {
    return this.authService.manageCompanyAgent(authorization, agentId, dto);
  }

  @Delete('agents/:agentId')
  @ApiOperation({ summary: 'Remove um agente da empresa autenticada' })
  removeAgent(
    @Headers('authorization') authorization: string | undefined,
    @Param('agentId') agentId: string,
  ) {
    return this.authService.removeCompanyAgent(authorization, agentId);
  }

  @Get('me/chatwoot-config')
  @ApiOperation({ summary: 'Retorna o status da integracao do Chatwoot para a empresa autenticada' })
  chatwootConfig(@Headers('authorization') authorization?: string) {
    return this.authService.getChatwootConfig(authorization);
  }

  @Patch('me/chatwoot-config')
  @ApiOperation({ summary: 'Atualiza os tokens e time padrao do Chatwoot para a empresa autenticada' })
  @ApiBody({ type: UpdateChatwootConfigDto })
  updateChatwootConfig(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: UpdateChatwootConfigDto,
  ) {
    return this.authService.updateChatwootConfig(authorization, dto);
  }

  @Post('me/chatwoot-sync-agents')
  @ApiOperation({ summary: 'Sincroniza agentes legados da empresa autenticada com o Chatwoot' })
  syncChatwootAgents(@Headers('authorization') authorization?: string) {
    return this.authService.syncCompanyAgentsWithChatwoot(authorization);
  }

  @Get('me/promise-automation')
  @ApiOperation({ summary: 'Retorna as configuracoes de automacao de promessas da empresa autenticada' })
  promiseAutomation(@Headers('authorization') authorization?: string) {
    return this.authService.getPromiseAutomationSettings(authorization);
  }

  @Patch('me/promise-automation')
  @ApiOperation({ summary: 'Atualiza as configuracoes de automacao de promessas da empresa autenticada' })
  updatePromiseAutomation(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: UpdatePromiseAutomationSettingsDto,
  ) {
    return this.authService.updatePromiseAutomationSettings(authorization, dto);
  }

  @Post('switch-company/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Troca a empresa ativa do super_admin e reemite o JWT com o novo companyId.',
    description:
      'Restrito a super administradores. Retorna um novo accessToken vinculado a empresa alvo — o frontend deve substituir o token em memoria/localStorage.',
  })
  @ApiOkResponse({
    description: 'Novo JWT emitido para a empresa alvo.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        accessToken: { type: 'string' },
        company: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            account: { type: 'string' },
            active: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Token ausente, invalido ou agente bloqueado.' })
  @ApiForbiddenResponse({ description: 'Apenas super administradores.' })
  @ApiNotFoundResponse({ description: 'Empresa nao encontrada ou inativa.' })
  switchCompany(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const agentId = req.user?.agentId;
    if (!agentId) {
      throw new UnauthorizedException('Sessao invalida.');
    }
    return this.authService.switchActiveCompany(agentId, id);
  }
}
