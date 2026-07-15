import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthService } from '../auth/auth.service';

export class MaestroAgentsWebhookDto {
  @ApiProperty({
    description:
      'Lista de account_chatwoot das empresas afetadas. Serao sincronizadas apenas as que possuirem o token_system_coraxy enviado no header x-company-token.',
    example: ['4', '5'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  accounts!: string[];
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class MaestroWebhookController {
  private readonly logger = new Logger(MaestroWebhookController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * Webhook de PUSH do Maestro: quando um ou mais agentes mudam, o Maestro
   * dispara UMA requisicao com o array de accounts afetadas. O backend
   * ressincroniza os agentes de cada empresa correspondente (event-driven, sem
   * polling).
   *
   * Autenticacao: header `x-company-token` = um `token_system_coraxy`. So sao
   * sincronizadas as accounts do array cuja empresa possui EXATAMENTE esse
   * token. Accounts com token diferente sao rejeitadas individualmente no
   * resultado (falha parcial nao derruba as demais).
   */
  @Public()
  @Post('agents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sincroniza agentes do Maestro (push em lote por account)',
    description:
      'Recebe do Maestro um array de account_chatwoot e ressincroniza os agentes das empresas autorizadas pelo token_system_coraxy do header. Event-driven: roda somente quando o Maestro empurra.',
  })
  @ApiHeader({
    name: 'x-company-token',
    required: true,
    description:
      'token_system_coraxy da(s) empresa(s). Autoriza a sincronizacao das accounts do array cuja empresa possui esse token.',
    schema: { type: 'string', example: 'seu-token-system-coraxy' },
  })
  @ApiBody({ type: MaestroAgentsWebhookDto })
  @ApiOkResponse({
    description:
      'Processado. Retorna o resultado por account (tolerante a falha parcial).',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        requested: { type: 'number', example: 2 },
        synced: { type: 'number', example: 1 },
        failed: { type: 'number', example: 1 },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              account: { type: 'string', example: '4' },
              ok: { type: 'boolean', example: true },
              companyId: { type: 'string', format: 'uuid' },
              synced: { type: 'number', example: 42 },
              skipped: { type: 'number', example: 5 },
              message: { type: 'string' },
              error: {
                type: 'string',
                example: 'Token nao autorizado para esta account',
              },
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Header x-company-token ausente ou vazio.',
  })
  @ApiBadRequestResponse({
    description: '"accounts" ausente ou nao e um array nao vazio.',
  })
  async syncAgents(
    @Headers('x-company-token') token: string | undefined,
    @Body() body: MaestroAgentsWebhookDto,
  ) {
    const normalizedToken = String(token ?? '').trim();
    if (!normalizedToken) {
      throw new UnauthorizedException(
        'Token ausente. Envie o token_system_coraxy no header x-company-token.',
      );
    }

    const accounts = Array.isArray(body?.accounts) ? body.accounts : null;
    if (!accounts || accounts.length === 0) {
      throw new BadRequestException(
        'Informe "accounts" como um array nao vazio de account_chatwoot.',
      );
    }

    this.logger.log(
      `[MaestroAgentsWebhook] push recebido para ${accounts.length} account(s)`,
    );

    return this.authService.syncAgentsForAccounts(accounts, normalizedToken);
  }
}
