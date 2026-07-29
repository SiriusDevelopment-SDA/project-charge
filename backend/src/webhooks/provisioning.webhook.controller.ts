import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { CompaniesService } from '../companies/companies.service';
import { CreateCompanyDto } from '../companies/dto/create-company.dto';
import { UpdateCompanyDto } from '../companies/dto/update-company.dto';

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
   * Alteracao de empresa a partir do CRM.
   *
   * Identificada por `crm_company_id`, e nao pelo id interno: o CRM conhece o
   * proprio identificador e nao deveria precisar guardar o nosso. E o mesmo
   * campo que ja torna o provisionamento idempotente.
   *
   * Existe para tirar o `UPDATE` manual do banco de circulacao. Enquanto ele foi
   * a unica forma de alterar uma empresa, o `config` acumulou 22 chaves, 5 sem
   * nenhum leitor — e uma URL errada so aparecia semanas depois, como
   * "sincronizacao vazia".
   *
   * Toda a regra vive em `CompaniesService.update()`, a mesma do endpoint
   * humano: campos nomeados, config montado pelo backend, e credencial testada
   * no ERP antes de valer.
   */
  @Public()
  @Patch('companies/:crmCompanyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Altera uma empresa provisionada, identificada pelo id do CRM.',
    description:
      'Mesma regra do PATCH /companies/:id, com autenticacao por segredo de provisionamento. Envie apenas os campos que mudaram. Alterar `url` ou `credenciais` dispara novo preflight — util para corrigir uma empresa que ficou inativa por credencial recusada, sem precisar recadastrar.',
  })
  @ApiHeader({
    name: 'x-provisioning-token',
    required: true,
    description:
      'Segredo de provisionamento (variavel de ambiente PROVISIONING_TOKEN).',
  })
  @ApiParam({
    name: 'crmCompanyId',
    description: 'O mesmo `crm_company_id` enviado no provisionamento.',
    example: 'CRM-0001',
  })
  @ApiBody({ type: UpdateCompanyDto })
  @ApiOkResponse({
    description:
      'Empresa alterada. Confira `preflight.status` e `company.active`; `config.descartadas` lista chaves fora do contrato que foram removidas.',
  })
  @ApiUnauthorizedResponse({
    description: 'Header ausente ou segredo invalido.',
  })
  @ApiNotFoundResponse({
    description: 'Nenhuma empresa cadastrada com esse crm_company_id.',
  })
  @ApiBadRequestResponse({
    description: 'Payload invalido ou credenciais do ERP faltando.',
  })
  async alterar(
    @Headers('x-provisioning-token') token: string | undefined,
    @Param('crmCompanyId') crmCompanyId: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    this.autorizar(token);

    // Alteracao de `url` ou `credenciais` por este canal merece log proprio, em
    // WARN. O `PROVISIONING_TOKEN` e unico e sem escopo por empresa: quem o
    // tiver pode apontar o ERP de uma empresa existente para um host que
    // controle, e a proxima sincronizacao entregaria CPF, telefone e faturas
    // para la. Nao da para impedir isso sem trocar o modelo de segredo, mas da
    // para nao deixar acontecer em silencio.
    if (dto.url !== undefined || dto.credenciais !== undefined) {
      const campos = [
        dto.url !== undefined ? 'url' : null,
        dto.credenciais !== undefined ? 'credenciais' : null,
      ].filter(Boolean);
      this.logger.warn(
        `[Provisioning] AUDITORIA: alteracao de ${campos.join(' e ')} via webhook para ` +
          `crm_company_id=${crmCompanyId}` +
          (dto.url !== undefined ? ` (novo host: ${dto.url})` : ''),
      );
    }

    this.logger.log(
      `[Provisioning] alteracao pedida para crm_company_id=${crmCompanyId}`,
    );

    return this.companiesService.update({ crmCompanyId }, dto);
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
