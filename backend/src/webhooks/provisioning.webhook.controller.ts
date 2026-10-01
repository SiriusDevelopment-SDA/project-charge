import {
  BadRequestException,
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
import { VincularCrmDto } from '../companies/dto/vincular-crm.dto';

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
   *
   * O CONTRATO E O MESMO DO ENDPOINT HUMANO — INCLUSIVE O QUE MUDOU
   *
   * Este endpoint recebe `CreateCompanyDto`, o MESMO objeto do POST /companies.
   * Nao ha DTO de provisionamento separado, e isso e deliberado: dois DTOs para
   * a mesma operacao virariam duas regras de negocio divergentes, que e
   * exatamente o que este controller evita ao delegar tudo para
   * `CompaniesService.create()`.
   *
   * A consequencia direta: quando `cnpj`, `token_notificameHub` e `canais`
   * passaram de opcionais a obrigatorios no cadastro, passaram a ser
   * obrigatorios AQUI no mesmo commit, sem ninguem ter editado este arquivo. O
   * CRM que nao enviar os tres recebe 400. Isto e BREAKING para o CRM.
   *
   * Nao ha excecao para o chamador de maquina, e a razao e a mesma que tornou
   * os campos obrigatorios: a falta deles nao aparece no provisionamento,
   * aparece na primeira campanha. Uma empresa provisionada sem `cnpj` nasce sem
   * chave PIX de recebimento e cobra em lugar nenhum; sem `token_notificameHub`
   * nasce incapaz de disparar. Aceitar o provisionamento incompleto so moveria
   * a descoberta do erro para semanas depois, e sem ninguem para atribui-lo.
   *
   * PERGUNTA EM ABERTO (decisao de negocio, nao tecnica)
   *
   * Se o CRM NAO tiver o CNPJ no momento em que provisiona — por exemplo se ele
   * cria a empresa no fechamento do contrato e o CNPJ so e digitado depois —
   * recusar com 400 bloqueia o fluxo dele. A alternativa seria provisionar
   * INATIVA e exigir um PATCH com o CNPJ para ativar, reaproveitando o caminho
   * que ja existe para credencial recusada pelo ERP.
   *
   * Isso NAO foi implementado porque depende de como o CRM opera, e o custo de
   * errar e assimetrico: recusar cedo e um erro visivel e reversivel (o CRM
   * reenvia); aceitar incompleto cria empresa quebrada em silencio. Enquanto a
   * pergunta nao for respondida, o endpoint recusa — que e o lado seguro.
   */
  @Public()
  @Post('companies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Provisiona uma empresa a partir do CRM (chamador de maquina).',
    description: [
      'Mesma regra do POST /companies, com autenticacao por segredo de provisionamento em vez de JWT de sessao. Envie `crm_company_id` para tornar a chamada idempotente: repetir apos um timeout devolve a empresa existente com `jaExistia: true`, em vez de erro.',
      '',
      '**MUDANCA DE CONTRATO — o CRM precisa se adequar.**',
      '',
      'O corpo e o mesmo `CreateCompanyDto` do endpoint humano: nao existe versao reduzida para o CRM. Tres campos que eram opcionais passaram a ser OBRIGATORIOS, e a chamada que nao os enviar recebe 400:',
      '',
      '  cnpj                 14 digitos, com digitos verificadores conferidos.',
      '                       Pontuacao e aceita. E a chave PIX de recebimento',
      '                       quando a empresa nao configura `order_pix_key`.',
      '  token_notificameHub  X-Api-Token da conta NotificaMe. Sem ele o worker',
      '                       de disparo aborta toda mensagem da empresa.',
      '  canais               ao menos um `{ id, numero }`. E o remetente',
      '                       (`from`) do disparo.',
      '',
      'A exigencia nao foi aplicada retroativamente: empresa ja provisionada continua como esta. Ela vale para provisionamento NOVO, e o motivo e o modo de falha desses campos — a ausencia deles nao aparece aqui, aparece na primeira campanha, como mensagem que nunca chega.',
      '',
      'Para ALTERAR uma empresa ja provisionada, use PATCH /webhooks/companies/{crm_company_id}: la os tres seguem opcionais, e enviar o CNPJ so para trocar o nome nao e exigido.',
    ].join('\n'),
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
    description:
      'Payload invalido, credenciais do ERP faltando, ou um dos campos obrigatorios do disparo ausente (`cnpj`, `token_notificameHub`, `canais`). A mensagem nomeia o campo e diz o que ele quebra. Campo obrigatorio enviado como `null` conta como ausente e cai aqui — no CADASTRO nao existe valor anterior a preservar, entao `null` e recusado nomeando o campo, e nao ignorado como no PATCH.',
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
   * Vinculo em lote das empresas que existem dos dois lados mas nunca se
   * conheceram.
   *
   * Fica NESTE controller, e nao no humano, por uma razao operacional: quem
   * precisa vincular e o CRM, que e maquina e nao tem JWT de agente. Exigir
   * super_admin transformaria o vinculo em trabalho manual para alguem que ja
   * tem o proprio identificador na mao.
   *
   * Identifica pela `account_chatwoot` — e o que o CRM conhece dos dois lados.
   * Nao poderia ser pelo `crm_company_id`, que e justamente o que falta.
   *
   * O QUE ESTE ENDPOINT NAO PODE FAZER
   *
   * So DEFINE vinculo ausente. Empresa que ja tem vinculo volta como conflito,
   * sem escrita, e id do CRM ja usado por outra empresa tambem. Isso importa
   * aqui mais do que no endpoint humano: o `PROVISIONING_TOKEN` e unico e sem
   * escopo por empresa, entao permitir repontar vinculo existente deixaria quem
   * tem o token assumir o controle de qualquer empresa ja provisionada. Definir
   * o que esta vazio e o suficiente para o CRM operar, e e o limite.
   */
  @Public()
  @Post('companies/vincular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Vincula empresas ja cadastradas as suas correspondentes no CRM.',
    description:
      'Para as empresas que existem dos dois lados mas nunca se conheceram. Sem `crm_company_id` o CRM nao alcanca a empresa: `PATCH /webhooks/companies/:crm_company_id` devolve 404 e recadastrar devolve 409 porque o `account_chatwoot` ja existe. Identifica pela account, que e o que o CRM conhece. Nao roda preflight nem altera qualquer outro dado — inclusive NAO limpa chaves fora do contrato, porque vincular nao e pedir faxina. Item invalido nao derruba o lote: o resultado volta item a item. Reenviar o mesmo lote e seguro. So DEFINE vinculo ausente: empresa ja vinculada volta como conflito, nunca e repontada.',
  })
  @ApiHeader({
    name: 'x-provisioning-token',
    required: true,
    description:
      'Segredo de provisionamento (variavel de ambiente PROVISIONING_TOKEN).',
  })
  @ApiBody({ type: VincularCrmDto })
  @ApiOkResponse({
    description:
      'Lote processado. `resumo` traz os totais e `resultados` o status de cada par: `vinculada`, `ja_vinculada`, `nao_encontrada`, `conflito_vinculo_existente` ou `conflito_crm_id_em_uso`. `success` e true apenas quando nenhum par falhou.',
  })
  @ApiUnauthorizedResponse({
    description: 'Header ausente ou segredo invalido.',
  })
  @ApiBadRequestResponse({ description: 'Lote vazio ou par mal formado.' })
  vincular(
    @Headers('x-provisioning-token') token: string | undefined,
    @Body() dto: VincularCrmDto,
  ) {
    this.autorizar(token);

    this.logger.log(
      `[Provisioning] vinculo pedido para ${dto.vinculos.length} empresa(s).`,
    );

    return this.companiesService.vincularCrm(dto);
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
    description: [
      'Mesma regra do PATCH /companies/:id, com autenticacao por segredo de provisionamento. Envie apenas os campos que mudaram. Alterar `url` ou `credenciais` dispara novo preflight — util para corrigir uma empresa que ficou inativa por credencial recusada, sem precisar recadastrar. Um ERP que nao responde nao inativa empresa ja ativa (veja `preflight.causa`). Corpo vazio nao altera nada e serve de previa: `aplicado: false` e `config.descartadas` com o que um PATCH real removeria — seguro para health-check.',
      '',
      '**`null` vale como campo NAO ENVIADO em todos os campos.** O CRM reenvia o registro inteiro e manda `null` no que nao tem preenchido; isso nao e um pedido de alteracao, e o campo simplesmente nao e tocado. Vale para todo o corpo: `name`, `url`, `cnpj`, `plano`, `teamChargeId`, os tokens, `canais`, `paginasExtras`, `credenciais` e as chaves PIX. `teamChargeId: null` NAO limpa — ali quem limpa e `""`, que continua sendo o pedido explicito. As chaves PIX (`pagamento.order_pix_key` e o tipo) nao aceitam nem `null` nem `""`: as duas formas mantem o valor atual, porque apagar a chave de recebimento por engano manda a cobranca para o lugar errado.',
      '',
      '**Omitir e enviar vazio tem o mesmo efeito: o campo nao e alterado.** Vale para `cnpj` e `token_notificameHub`. Ao contrario do provisionamento, aqui os dois sao opcionais — trocar o nome da empresa nao exige reenviar o CNPJ — e mandar `""` (ou so espacos) junto no payload nao apaga nada nem devolve 400: o valor atual permanece e a requisicao segue. Feito assim de proposito para o CRM que reenvia o registro inteiro, onde recusar o vazio faria um PATCH de `name` falhar por um campo que ninguem pediu para mudar. Limpar os dois nunca foi possivel de qualquer forma: as colunas sao NOT NULL.',
      '',
      'Este e tambem o caminho para completar o CNPJ de uma empresa provisionada antes da exigencia.',
      '',
      'Valor COM conteudo continua validado: o `cnpj` passa pela mesma checagem do cadastro (14 digitos e digitos verificadores) e valor invalido devolve 400. Antes, este endpoint aceitava qualquer texto — `"abc"` era gravado como string vazia e apagava a chave PIX de recebimento da empresa sem erro nenhum.',
    ].join('\n'),
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
    description:
      [
        'Payload invalido, credenciais do ERP faltando, tentativa de alterar `crm_company_id`,',
        'ou `cnpj` que nao passa nos digitos verificadores.',
        '',
        'NAO devolve 400 por causa de `null`. Campo `null` vale como campo nao enviado, em TODOS os',
        'campos do corpo — inclusive `crm_company_id: null`, que nao e tentativa de repontar vinculo',
        'e portanto nao cai na recusa acima. Isso existe para o CRM que reenvia o registro inteiro:',
        'o que ele nao tem preenchido chega como `null`, e recusa-lo (ou pior, grava-lo) transformaria',
        'um PATCH de `name` em erro — ou em perda silenciosa de dado.',
        '',
        'NAO devolve 400 quando `cnpj` ou `token_notificameHub` chegam VAZIOS. Neste PATCH os dois',
        'sao opcionais e o vazio vale como campo nao enviado: `""` e `"   "` mantem o valor atual',
        'e a requisicao segue normal, igualzinho a ter omitido o campo. Limpar os dois nunca foi',
        'possivel (colunas NOT NULL), entao nao ha pedido a recusar — so ruido do chamador que',
        'reenvia o payload inteiro. O que continua sendo 400 e valor COM conteudo e invalido,',
        'como `cnpj: "abc"` (o `cnpj` E a chave PIX de recebimento no caso normal).',
        '',
        'DEVOLVE 400 quando `name`, `url`, `token_system_coraxy` ou `crm_company_id` chegam com',
        'espaco em branco (`"   "`). Nesses quatro o vazio sempre foi 400; o que mudou e que o',
        'espaco deixou de furar a checagem e ser gravado como campo VAZIO — nome de empresa vazio,',
        'host de ERP vazio, token vazio, tudo com 200 na resposta. Valor com conteudo cercado de',
        'espacos continua aceito, ja aparado.',
      ].join('\n'),
  })
  async alterar(
    @Headers('x-provisioning-token') token: string | undefined,
    @Param('crmCompanyId') crmCompanyId: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    this.autorizar(token);

    // O vinculo NAO se altera por este canal, nem quando o valor enviado e o
    // mesmo da URL. Duas razoes:
    //
    // 1. Nao resolveria nada. Este endpoint encontra a empresa PELO vinculo —
    //    quem ainda nao tem nunca chega ate aqui, devolve 404 antes. Definir
    //    vinculo ausente e trabalho do `POST companies/vincular`, logo acima.
    // 2. Abriria sequestro. O `PROVISIONING_TOKEN` e unico e sem escopo por
    //    empresa: quem o tiver repontaria o vinculo de uma empresa existente
    //    para um id que controla, e passaria a alterar empresa alheia com 200
    //    em toda resposta. Por isso o endpoint de vinculo tambem so DEFINE o
    //    que esta vazio: os dois caminhos param na mesma linha.
    //
    // `null` NAO chega aqui como recusa: o `@CampoOpcional()` do DTO ja o
    // converteu em `undefined`. Era preciso, porque o CRM manda o registro
    // inteiro e o vinculo em branco viaja como `null` — e esta guarda respondia
    // 400 acusando uma alteracao de vinculo que ninguem pediu.
    if (dto.crm_company_id !== undefined) {
      throw new BadRequestException(
        'crm_company_id nao pode ser alterado por este endpoint. Ele identifica ' +
          'a empresa aqui — muda-lo por este canal apontaria o CRM para outra ' +
          'empresa. Use POST /webhooks/companies/vincular para DEFINIR vinculo ausente.',
      );
    }

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
