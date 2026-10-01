import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Validate,
  ValidateNested,
} from 'class-validator';
import { erpCodes } from '../../integrations/erp/erp.registry';
import { textoAparado } from '../../validations/campo-opcional.decorator';
import { CnpjValidoConstraint } from '../../validations/cnpj.validator';
import { PAGINAS_IDS, PLANOS } from '../planos';

export class CanalNotificameDto {
  @ApiProperty({
    description: 'Id do canal no NotificaMe Hub.',
    example: '00000000-0000-0000-0000-000000000000',
  })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({
    description: 'Numero do canal, com DDI e DDD.',
    example: '+55 00 0000-0000',
  })
  @IsString()
  numero!: string;
}

/**
 * Cadastro de empresa.
 *
 * ATENCAO AO EDITAR: os `example` deste arquivo aparecem na documentacao
 * Swagger, que hoje esta publicamente acessivel em `/api/docs`. Use somente
 * valores ficticios — nunca host, CNPJ, telefone ou token de cliente real.
 *
 * O que este DTO deliberadamente NAO aceita:
 *
 * - **`config` cru.** Era o vetor do incidente que originou este endpoint: o
 *   `config` vinha copiado inteiro de outra empresa, trazendo junto o marcador
 *   `lastClientSyncAt` (que fazia a empresa nascer travada em sincronizacao
 *   incremental e nunca baixar faturas) e ate as credenciais da empresa de
 *   origem. Aqui o `config` e MONTADO pelo backend a partir de campos nomeados.
 *
 * - **As colunas mortas** (`table_vector`, `label`, `total_active_customers`,
 *   `downtime`, `responsible`, `acess_token_agentbot_chatwoot`). Nenhuma tem
 *   leitura em backend ou frontend; sao `NOT NULL` por historico. O backend
 *   preenche com valor minimo e nunca pergunta ao operador.
 *
 * Como `forbidNonWhitelisted: true` esta ativo no ValidationPipe global
 * (`main.ts`), qualquer campo nao declarado aqui resulta em 400 — inclusive uma
 * tentativa de mandar `config`.
 *
 * O QUE O DISPARO EXIGE (mudanca de contrato)
 *
 * `cnpj`, `token_notificameHub` e `canais` passaram de opcionais a
 * OBRIGATORIOS. Os tres sao consumidos pelo disparo de template, e a falta de
 * qualquer um deles nao aparece no cadastro: aparece na primeira campanha, como
 * mensagem que nao chega.
 *
 *   token_notificameHub  ausente -> o worker aborta com "Empresa sem
 *                                   integracao NotificaMe configurada"
 *   canais vazio         ausente -> nao ha `from`, nao ha de qual numero enviar
 *   cnpj                 ausente -> `resolverChavePix` nao acha chave de
 *                                   recebimento e o botao PIX sai sem `key`
 *
 * Isto e BREAKING para os dois chamadores deste DTO: `POST /companies`
 * (super_admin) e `POST /webhooks/companies` (provisionamento pelo CRM). O CRM
 * precisa passar a enviar os tres campos, ou passa a receber 400.
 *
 * NAO vale retroativamente. Empresa ja cadastrada sem canal continua como esta,
 * e o `PATCH /companies/:id` (`UpdateCompanyDto`) segue com os tres campos
 * opcionais de proposito: alterar so o nome de uma empresa nao pode exigir o
 * reenvio do CNPJ.
 *
 * O PATCH tambem nao e porta dos fundos: o `cnpj` passa pelo mesmo
 * `CnpjValidoConstraint` daqui, entao "abc" ou DV errado devolvem 400 nos dois
 * endpoints. A unica diferenca esta no VAZIO — la `""` vale como campo nao
 * enviado e mantem o valor atual, porque existe um valor atual a preservar e o
 * CRM reenvia o payload inteiro. Aqui nao existe: `""` no cadastro e 400. Ver
 * `vazioComoAusente`, em `validations/campo-opcional.decorator.ts`.
 *
 * `null` SEGUE A MESMA LINHA, E PELO MESMO MOTIVO
 *
 * No `UpdateCompanyDto` todo campo opcional trata `null` como CAMPO NAO
 * ENVIADO. Aqui NAO: campo obrigatorio com `null` devolve 400 nomeando o campo,
 * e isso sai de graca — sem `@IsOptional()`, o proprio `@IsString()`/`@IsIn()`
 * recusa `null`. Ignorar um obrigatorio criaria a empresa pela metade em
 * silencio, que e exatamente o modo de falha que tornou `cnpj`,
 * `token_notificameHub` e `canais` obrigatorios.
 *
 * Os tres opcionais daqui (`paginasExtras`, `crm_company_id`, `teamChargeId`)
 * nao precisaram de `@CampoOpcional()`: o `create()` ja os le com `?.`, entao
 * `null` nunca chegou a estourar neste caminho — e nao ha valor anterior que um
 * `null` pudesse apagar, porque a empresa esta nascendo.
 *
 * `"   "` TAMBEM E CAMPO VAZIO
 *
 * O `@IsNotEmpty()` do class-validator reprova `""`, `null` e `undefined` — e
 * so. `"   "` passava inteiro por ele, e o service gravava o `.trim()`: empresa
 * nascia com nome vazio, host de ERP vazio ou `account_chatwoot` vazio, que e
 * chave de unicidade. Nenhum erro, 200 na resposta.
 *
 * O `@Transform(textoAparado)` nos campos de texto obrigatorios apara ANTES da
 * validacao, entao o espaco em branco chega ao `@IsNotEmpty()` como vazio e e
 * recusado nomeando o campo. O valor gravado nao muda: o service ja aparava
 * depois — o que mudou foi a ordem, e com ela a chance de gravar vazio.
 */
export class CreateCompanyDto {
  @ApiProperty({
    description: 'Nome da empresa, como deve aparecer no sistema.',
    example: 'PROVEDOR EXEMPLO',
  })
  @Transform(textoAparado)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description:
      'Endereco do ERP: apenas o host. Sem "https://", sem barra no final e sem caminho — o backend monta a URL completa.',
    example: 'erp.exemplo.com.br',
  })
  @Transform(textoAparado)
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiProperty({
    description:
      'Numero da conta da empresa no Chatwoot. Precisa ser unico: repetido devolve 409.',
    example: '99',
  })
  @Transform(textoAparado)
  @IsString()
  @IsNotEmpty()
  account_chatwoot!: string;

  @ApiProperty({
    description:
      'ERP da empresa. Consulte GET /companies/erps para ver, de cada ERP, o que o sistema sincroniza e quais credenciais exige.',
    enum: erpCodes(),
    example: 'IXC',
  })
  @IsString()
  @IsIn(erpCodes(), {
    message: `erp deve ser um destes: ${erpCodes().join(', ')}`,
  })
  erp!: string;

  @ApiProperty({
    description: [
      'Credenciais de acesso ao ERP. Os campos mudam conforme o `erp` escolhido:',
      '',
      '- IXC: autorization',
      '- SGP: username, password',
      '- MK: sys, password, cd_servico, masterToken',
      '- HUBSOFT: client_id, username, password (client_secret e opcional)',
      '- GAMAISP: rest_key, login, password',
      '- RADIUSNET: nenhuma',
      '',
      'A credencial e testada no ERP antes de a empresa ser gravada. Campo faltando devolve 400 dizendo qual e e para que serve. GET /companies/erps traz a lista sempre atualizada.',
    ].join('\n'),
    example: { autorization: '00:0000000000000000000000000000000000000000' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  credenciais!: Record<string, string>;

  @ApiProperty({
    description: [
      'Produto contratado pela empresa. Aceita EXATAMENTE um destes dois valores:',
      '',
      '  "disparo"  -> libera: disparo manual, campanhas, templates, historico',
      '  "cobranca" -> libera tudo acima + dashboard, clientes vencidos, chat',
      '',
      'Obrigatorio de proposito: e uma decisao comercial, e assumir um valor padrao em silencio significaria entregar o produto de cobranca sem ter sido vendido.',
    ].join('\n'),
    enum: PLANOS,
    example: 'cobranca',
  })
  @IsIn(PLANOS as unknown as string[])
  plano!: string;

  @ApiProperty({
    description:
      'Token da empresa, usado na autorizacao do webhook de agentes do Maestro.',
    example: 'token-da-empresa-aqui',
  })
  @Transform(textoAparado)
  @IsString()
  @IsNotEmpty()
  token_system_coraxy!: string;

  @ApiPropertyOptional({
    description: [
      'Paginas liberadas ALEM do plano, para quando um item e vendido avulso.',
      'Ex.: plano "disparo" com clientes vencidos incluso.',
      '',
      'Aceita apenas os nomes abaixo, escritos exatamente assim:',
      '',
      `  ${PAGINAS_IDS.join('\n  ')}`,
      '',
      'Nome fora dessa lista devolve 400. Omita o campo se nao houver adicional.',
    ].join('\n'),
    enum: PAGINAS_IDS,
    isArray: true,
    example: ['clientesVencidos'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(PAGINAS_IDS as unknown as string[], { each: true })
  paginasExtras?: string[];

  @ApiPropertyOptional({
    description:
      'Id da empresa no CRM. Envie sempre: e o que permite repetir a chamada com seguranca depois de um timeout de rede — o reenvio devolve a empresa ja existente em vez de erro.',
    example: 'CRM-0001',
  })
  @IsOptional()
  @IsString()
  crm_company_id?: string;

  @ApiProperty({
    description: [
      'CNPJ da empresa: 14 digitos. Pontuacao e aceita e removida antes de',
      'gravar ("11.222.333/0001-81" vira "11222333000181").',
      '',
      'Obrigatorio porque e a chave PIX de recebimento quando a empresa nao',
      'configura `pagamento.order_pix_key` — sem ele o botao de pagamento do',
      'WhatsApp sai sem `key` e a Meta recusa a mensagem DEPOIS de o disparo ja',
      'ter sido aceito como `queued`. Os digitos verificadores sao conferidos:',
      'CNPJ errado vira chave PIX errada, e isso so aparece como cobranca que',
      'nunca chegou.',
    ].join('\n'),
    example: '11222333000181',
  })
  @Validate(CnpjValidoConstraint)
  cnpj!: string;

  @ApiPropertyOptional({
    description: 'Id do time de cobranca no Chatwoot.',
    example: '00',
  })
  @IsOptional()
  @IsString()
  teamChargeId?: string;

  @ApiProperty({
    description: [
      'X-Api-Token da conta NotificaMe. E compartilhado entre os canais da',
      'empresa e e a fonte autoritativa do token de TODO envio.',
      '',
      'Obrigatorio: sem ele o worker de disparo aborta a mensagem com "Empresa',
      'sem integracao NotificaMe configurada". Uma empresa cadastrada sem token',
      'nasce incapaz de disparar, e isso so e descoberto na primeira campanha.',
    ].join('\n'),
  })
  @Transform(textoAparado)
  @IsString({ message: 'token_notificameHub deve ser texto.' })
  @IsNotEmpty({
    message:
      'token_notificameHub e obrigatorio: sem ele a empresa nao consegue disparar nenhuma mensagem.',
  })
  token_notificameHub!: string;

  @ApiProperty({
    description: [
      'Canais NotificaMe pelos quais a empresa dispara. Ao menos um.',
      '',
      'Obrigatorio: o canal e o remetente (`from`) do disparo. Sem nenhum canal',
      'nao ha de qual numero enviar, e o disparo falha na hora do envio, nao no',
      'cadastro. Empresas cadastradas ANTES desta regra podem estar sem canal —',
      'a exigencia vale para cadastro novo e nao foi aplicada retroativamente.',
    ].join('\n'),
    type: [CanalNotificameDto],
  })
  @IsArray({ message: 'canais deve ser uma lista de canais NotificaMe.' })
  @ArrayNotEmpty({
    message:
      'canais: informe ao menos um canal NotificaMe — e o numero remetente do disparo.',
  })
  @ValidateNested({ each: true })
  @Type(() => CanalNotificameDto)
  canais!: CanalNotificameDto[];
}
