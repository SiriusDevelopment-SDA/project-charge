import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { CompaniesService } from '../companies/companies.service';
import { CreateCompanyDto } from '../companies/dto/create-company.dto';

@ApiTags('Webhooks')
@Controller('webhooks')
export class ProvisioningWebhookController {
  private readonly logger = new Logger(ProvisioningWebhookController.name);

  constructor(
    private readonly companiesService: CompaniesService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Provisionamento de empresa a partir do CRM.
   *
   * Existe separado do `POST /companies` porque aquele endpoint espera um JWT de
   * sessao humana (emitido no login, valido por 12h) e exige role super_admin —
   * shape errado para chamador de maquina: obrigaria o CRM a guardar a senha de
   * uma pessoa e quebraria sozinho quando o token expirasse.
   *
   * Autenticacao por segredo dedicado no header `x-provisioning-token`. NAO da
   * para reaproveitar o `token_system_coraxy` como faz o webhook de agentes do
   * Maestro: la o token e buscado pela empresa da account, e aqui a empresa
   * ainda nao existe — nao ha o que consultar.
   *
   * Toda a regra vive em `CompaniesService.create()`, a mesma do endpoint
   * humano: `config` montado pelo backend, credencial testada no ERP antes de
   * gravar, e empresa criada INATIVA com o motivo quando o ERP recusa.
   */
  @Public()
  @Post('companies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Provisiona uma empresa a partir do CRM (chamador de maquina).',
    description:
      'Mesma regra do POST /companies, com autenticacao por segredo de provisionamento em vez de JWT de sessao. Envie `crm_company_id` para tornar a chamada idempotente: repetir apos um timeout devolve a empresa existente com `jaExistia: true`, em vez de erro.',
  })
  @ApiHeader({
    name: 'x-provisioning-token',
    required: true,
    description:
      'Segredo de provisionamento (variavel de ambiente PROVISIONING_TOKEN).',
  })
  @ApiBody({ type: CreateCompanyDto })
  @ApiOkResponse({
    description:
      'Empresa provisionada. Confira `preflight.status` e `company.active` — `falhou` significa criada inativa. `jaExistia: true` indica reenvio idempotente.',
  })
  @ApiUnauthorizedResponse({
    description: 'Header ausente ou segredo invalido.',
  })
  @ApiBadRequestResponse({
    description: 'Payload invalido ou credenciais do ERP faltando.',
  })
  @ApiConflictResponse({
    description:
      'Ja existe empresa com o account_chatwoot informado (e sem crm_company_id que permita tratar como reenvio).',
  })
  async provisionar(
    @Headers('x-provisioning-token') token: string | undefined,
    @Body() dto: CreateCompanyDto,
  ) {
    this.autorizar(token);

    this.logger.log(
      `[Provisioning] pedido para "${dto.name}" (account ${dto.account_chatwoot}, ERP ${dto.erp})`,
    );

    return this.companiesService.create(dto);
  }

  /**
   * Falha fechada: sem `PROVISIONING_TOKEN` configurado, o endpoint recusa tudo.
   * Nunca cair num default — um segredo previsivel aqui deixaria qualquer um
   * cadastrar empresa, e este endpoint e `@Public()` por natureza.
   */
  private autorizar(tokenRecebido: string | undefined) {
    const esperado = String(
      this.configService.get<string>('PROVISIONING_TOKEN') ?? '',
    ).trim();

    if (!esperado) {
      this.logger.error(
        '[Provisioning] PROVISIONING_TOKEN nao configurado — endpoint recusando todas as chamadas.',
      );
      throw new UnauthorizedException(
        'Provisionamento indisponivel: segredo nao configurado no servidor.',
      );
    }

    const recebido = String(tokenRecebido ?? '').trim();
    if (!recebido || !this.comparaSegura(recebido, esperado)) {
      this.logger.warn(
        '[Provisioning] tentativa com token ausente ou invalido.',
      );
      throw new UnauthorizedException('Token de provisionamento invalido.');
    }
  }

  /**
   * Comparacao em tempo constante. Um `===` vaza o tamanho do prefixo correto
   * pelo tempo de resposta, e este endpoint e publico — da para forcar o
   * segredo byte a byte.
   */
  private comparaSegura(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
