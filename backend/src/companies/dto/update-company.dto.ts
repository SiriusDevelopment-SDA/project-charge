import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidateNested,
} from 'class-validator';
import {
  CampoOpcional,
  TextoOpcional,
} from '../../validations/campo-opcional.decorator';
import { CnpjValidoConstraint } from '../../validations/cnpj.validator';
import { TIPOS_CHAVE_PIX } from '../config.contract';
import { PAGINAS_IDS, PLANOS } from '../planos';
import { CanalNotificameDto } from './create-company.dto';

/**
 * `null` E VAZIO VALEM COMO CAMPO NAO ENVIADO.
 *
 * As duas regras vivem em `validations/campo-opcional.decorator.ts`, com o
 * raciocinio completo. O resumo, para quem edita este arquivo:
 *
 * - `@CampoOpcional()` normaliza SO o `null`. Todo campo opcional daqui leva
 *   este ou o de baixo — sem ele, o `@IsOptional()` deixa o `null` passar e o
 *   `companies.service.ts` estoura em `dto.campo.trim()`, devolvendo 500 para
 *   um payload que nao pedia alteracao nenhuma.
 * - `@TextoOpcional()` normaliza `null` E `""`. So em `cnpj` e
 *   `token_notificameHub`, onde limpar nunca foi alcancavel (colunas NOT NULL
 *   desde a migration `RequireCompanyCnpjAndNotificameToken`, que trata
 *   `btrim(coluna) = ''` como coluna FALTANDO).
 *
 * Nos DEMAIS campos o `""` mantem o significado que sempre teve — "limpa" em
 * `teamChargeId` e nas chaves PIX, 400 em `name`, `url`, `token_system_coraxy`
 * e `crm_company_id`. Só o `null` virou ausencia em todos.
 *
 * UNICA EXCECAO, DELIBERADA: os campos numericos de `AjustesErpDto`. Ver o
 * docblock daquela classe.
 */

/**
 * Ajustes finos de comunicacao com o ERP.
 *
 * Existem porque nem todo ERP aguenta o padrao: a ADRENALINA, por exemplo,
 * comeca a estourar timeout a partir da pagina ~50 com a concorrencia padrao de
 * 5. Ate aqui, baixar isso exigia `UPDATE` manual no `config` — que e
 * exatamente o habito que este endpoint veio encerrar.
 *
 * A UNICA EXCECAO A REGRA DO `null`
 *
 * Nos campos abaixo `null` NAO vale como ausencia: ele REMOVE o ajuste, e a
 * empresa volta ao default do codigo. Por isso eles ficam com `@IsOptional()`
 * puro, sem o `@CampoOpcional()` que o resto do DTO usa — e `montarConfig` ja
 * trata `null` como remocao desde sempre.
 *
 * O motivo e que aqui `null` e o UNICO jeito de limpar. Nos campos de texto ha
 * `""` para pedir limpeza, entao o `null` sobra para significar ausencia; num
 * campo numerico nao existe segundo token, e transformar `null` em ausencia
 * deixaria um ajuste gravado sem nenhuma forma suportada de tirar — de volta ao
 * `UPDATE` manual que este endpoint veio encerrar.
 *
 * O risco de ruido, que motivou a regra geral, tambem nao se aplica: `ajustes`
 * e um objeto aninhado de tunning interno, que nenhum chamador manda "de
 * carona" — para chegar um `null` aqui, alguem precisou enviar o objeto
 * `ajustes` de proposito.
 */
export class AjustesErpDto {
  @ApiPropertyOptional({
    description: 'Timeout de cada chamada ao ERP, em milissegundos.',
    minimum: 1000,
    maximum: 600000,
    example: 90000,
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(600000)
  timeoutMs?: number;

  @ApiPropertyOptional({
    description: 'Quantas vezes repetir uma chamada que falhou por rede.',
    minimum: 0,
    maximum: 10,
    example: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retries?: number;

  @ApiPropertyOptional({
    description:
      'Paginas de clientes buscadas em paralelo (SGP). Baixe para 1 ou 2 em ERP que estoura timeout.',
    minimum: 1,
    maximum: 20,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  clientsConcurrency?: number;

  @ApiPropertyOptional({
    description: 'Faturas buscadas em paralelo (MK).',
    minimum: 1,
    maximum: 20,
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  invoicesConcurrency?: number;

  @ApiPropertyOptional({
    description: [
      'Janela da sincronizacao de faturas, em DIAS para tras. Ausente = 1 ano,',
      'o padrao historico de todos os ERPs — nao mexa sem motivo.',
      '',
      'Existe para ERP que NAO aceita filtro de data (Gama ISP): la a janela nao',
      'e um filtro, e a distancia que a varredura precisa paginar. Medido na',
      'POWERNET, 1 ano custava de 2 a 4 HORAS por sincronizacao, repetidas toda',
      'madrugada. Em IXC/SGP/MK, que filtram no proprio ERP, nao ha razao para',
      'reduzir.',
      '',
      'Valor fora de 1..3650 e ignorado, e a janela volta ao padrao de 1 ano.',
    ].join('\n'),
    minimum: 1,
    maximum: 3650,
    example: 45,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  syncLookbackDays?: number;

  @ApiPropertyOptional({
    description: [
      'Quantos dias A FRENTE a sincronizacao de faturas cobre. Ausente = ate',
      '31/12 do ano corrente, o padrao historico de todos os ERPs.',
      '',
      'NAO reduz o custo da varredura: quem determina onde ela para e o',
      'syncLookbackDays. Este aqui corrige tres defeitos do 31/12 fixo: a',
      'janela encolhe ao longo do ano (em agosto cobre ~5,5 meses, em 20/dez',
      '~10 dias); salta na virada (01/01 passa a incluir um ano inteiro de',
      'faturas futuras de uma vez); e cria um ponto cego em dezembro, onde',
      'fatura vencendo em janeiro nao entra no snapshot e some da campanha.',
      '',
      'Valor fora de 1..3650 e ignorado, e o fim volta ao padrao 31/12.',
    ].join('\n'),
    minimum: 1,
    maximum: 3650,
    example: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  syncLookaheadDays?: number;
}

/**
 * Chave PIX de recebimento, usada no botao ORDER_DETAILS do WhatsApp.
 *
 * Nao entra em `AjustesErpDto` porque nao tem nada a ver com o ERP: aquele
 * grupo e numerico e trata de como falamos com o provedor; este e a chave para
 * a qual o cliente PAGA. Ver `CHAVES_PAGAMENTO` em `config.contract.ts`.
 *
 * Os DOIS campos sao obrigatorios para o botao existir. A Meta recusa
 * `pix_dynamic_code` sem `key` ou sem `key_type`, e recusa TARDE — o disparo e
 * aceito com `queued`, a mensagem so nao chega. Sem os dois configurados o
 * lembrete nao e enfileirado, e o log diz qual campo falta.
 *
 * ISTO E SOBREPOSICAO, NAO CADASTRO
 *
 * O caso NORMAL do negocio e a chave ser o CNPJ da empresa, com `key_type`
 * `CNPJ` — e por isso o `cnpj` e obrigatorio no cadastro. `resolverChavePix`
 * resolve isso sozinho, sem ninguem configurar nada aqui.
 *
 * Estes dois campos existem para a EXCECAO: a empresa que registrou no PSP uma
 * chave de e-mail, telefone ou aleatoria. Enquanto ninguem os envia, o CNPJ
 * responde — e e por isso que eles nao sao obrigatorios em lugar nenhum.
 *
 * NENHUM DOS DOIS ACEITA VAZIO COMO PEDIDO
 *
 * `null` e `""` valem como CAMPO NAO ENVIADO e mantem o valor atual (ver
 * `@TextoOpcional()`). A consequencia esta registrada e e conhecida: uma vez
 * gravada, a sobreposicao NAO tem como ser removida por este endpoint. Se um
 * dia for preciso desfaze-la — a empresa passou a cobrar no CNPJ de novo — isso
 * precisa de um caminho explicito e nomeado, nunca de uma string vazia vinda no
 * meio de um payload que o CRM reenviou inteiro: apagar a chave de recebimento
 * por engano manda a cobranca para o lugar errado, e ninguem descobre no PATCH.
 */
export class PagamentoPixDto {
  @ApiPropertyOptional({
    description: [
      'SOBREPOSICAO da chave PIX de recebimento, exatamente como registrada no PSP.',
      '',
      'OPCIONAL, e o normal e nao enviar: ausente, a chave usada e o CNPJ da',
      'empresa, com tipo CNPJ. Configure aqui SO quando a chave registrada no',
      'banco for e-mail, telefone ou aleatoria.',
      '',
      'Nao ha como limpar por aqui: `""` e `null` valem como campo nao enviado e',
      'mantem a chave atual. Uma chave de recebimento apagada por um vazio que',
      'veio de carona no payload mandaria a cobranca para o lugar errado, e isso',
      'nao aparece no PATCH — aparece semanas depois.',
    ].join('\n'),
    example: 'financeiro@exemplo.com.br',
  })
  @TextoOpcional()
  @IsString()
  order_pix_key?: string;

  @ApiPropertyOptional({
    description: [
      'Tipo da chave PIX. Precisa corresponder ao que a Meta aceita — valor fora',
      'da lista faz a Meta RECUSAR o template depois de o disparo ja ter sido',
      'aceito como `queued`.',
      '',
      '  EVP -> chave aleatoria (a Meta nao conhece "RANDOM")',
      '',
      'Obrigatorio quando `order_pix_key` e informada: o tipo NAO e deduzido da',
      'chave. `""` e `null` valem como campo nao enviado e mantem o tipo atual.',
      '',
      'Sem `order_pix_key` este campo nao tem uso: quem responde e o CNPJ, e o',
      'tipo dele e CNPJ por definicao.',
    ].join('\n'),
    enum: TIPOS_CHAVE_PIX,
    example: 'EMAIL',
  })
  @TextoOpcional()
  @IsString()
  // Os dois `@Transform` deste campo convergem em qualquer ordem: o do
  // `@TextoOpcional()` devolve `undefined` para `null` e para vazio, e este
  // devolve o valor intacto para tudo que nao e string. Nenhum depende de rodar
  // primeiro.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  // O `''` saiu da lista: ele nao chega mais aqui (vira `undefined` no
  // transform), e mante-lo sugeriria uma limpeza que este endpoint nao faz.
  @IsIn(TIPOS_CHAVE_PIX as unknown as string[])
  order_pix_key_type?: string;
}

/**
 * Alteracao de empresa ja cadastrada.
 *
 * ATENCAO AO EDITAR: os `example` aparecem na documentacao Swagger. Use somente
 * valores ficticios — nunca host, CNPJ, telefone ou token de cliente real.
 *
 * Este endpoint existe para encerrar o `UPDATE` manual no banco. Enquanto a
 * unica forma de alterar uma empresa foi SQL, o `config` acumulou 22 chaves
 * distintas, 5 delas sem nenhum leitor — a bagunca nao foi descuido de ninguem,
 * foi a ausencia de um caminho suportado.
 *
 * As mesmas duas recusas do cadastro valem aqui:
 *
 * - **`config` cru nao entra.** O backend monta o config a partir dos campos
 *   nomeados abaixo, preservando o que o sistema escreve (`lastClientSyncAt` e
 *   companhia) e descartando o que o contrato nao reconhece.
 * - **`account_chatwoot` e `erp` nao mudam.** Os dois sao identidade: a account
 *   amarra a empresa ao Chatwoot e e chave de unicidade; trocar o ERP mudaria o
 *   significado de toda credencial e de todo dado ja sincronizado. Para isso,
 *   cadastro novo.
 *
 * `null` SIGNIFICA A MESMA COISA EM TODO CAMPO: NAO ENVIADO
 *
 * O chamador de maquina nao omite campo — manda o registro inteiro e preenche
 * com o que tem. O que ele nao tem viaja como `null`, e isso nao e um pedido:
 * e a ausencia, escrita de outro jeito. Todo campo opcional deste DTO leva
 * `@CampoOpcional()` ou `@TextoOpcional()`, que convertem `null` em ausencia
 * antes da validacao. Antes disso o `null` atravessava o `@IsOptional()` e
 * estourava no service (`dto.campo.trim()`) como 500, ou — pior, porque calado
 * — apagava a `url` e removia o `plano` com 200 na resposta.
 *
 * O QUE `""` SIGNIFICA EM CADA CAMPO
 *
 * Todo campo aqui e opcional — omitir mantem o valor atual, porque trocar o
 * nome de uma empresa nao pode exigir reenviar o cadastro inteiro. O que muda
 * de campo para campo e o que uma STRING VAZIA quer dizer. Tres grupos:
 *
 * - **Limpavel** (`teamChargeId`, e so ele): `""` e um valor legitimo, "esta
 *   empresa nao tem isso". Declarado com `@CampoOpcional() @IsString()` e a
 *   instrucao "Envie \"\" para limpar" — o `@CampoOpcional()` normaliza `null`
 *   sem tocar no `""`, que e justamente o que preserva o pedido de limpeza.
 * - **Vazio vale como ausente** (`cnpj`, `token_notificameHub`,
 *   `pagamento.order_pix_key` e o tipo dela): `""` NAO limpa, NAO devolve 400 —
 *   e ignorado, e o valor atual permanece. Ver o docblock de
 *   `vazioComoAusente`, em `validations/campo-opcional.decorator.ts`.
 * - **Vazio devolve 400** (`name`, `url`, `token_system_coraxy`,
 *   `crm_company_id`): declarados com `@IsNotEmpty()`. Desde o
 *   `@CampoOpcional()`, `"   "` cai aqui tambem — antes ele furava o
 *   `@IsNotEmpty()` e era gravado como vazio.
 *
 * As chaves PIX mudaram de grupo: `""` LIMPAVA a chave de recebimento e agora
 * vale como campo nao enviado. O motivo esta no docblock de `PagamentoPixDto` —
 * em resumo, apagar chave de recebimento por um vazio que veio de carona manda
 * a cobranca para o lugar errado, e o PATCH responde 200.
 *
 * A diferenca entre os dois ultimos grupos nao e de importancia — e de origem
 * do vazio. `cnpj` e `token_notificameHub` sao os campos que o CRM reenvia em
 * lote no payload inteiro; recusa-los transformaria um PATCH de `name` em erro
 * por causa de um campo que ninguem pediu para alterar.
 *
 * O que NENHUM dos tres grupos aceita e valor invalido com conteudo. `cnpj` e
 * `token_notificameHub` so entraram nesta secao agora, junto com o NOT NULL da
 * migration `RequireCompanyCnpjAndNotificameToken`. Ate entao eram
 * `@IsOptional() @IsString()` sem mais nada, e o service gravava o que
 * chegasse: `cnpj: "abc"` virava `""` no `replace(/\D/g, '')` e apagava a chave
 * PIX de recebimento sem erro nenhum. Esse caso segue devolvendo 400 — o que
 * mudou foi so o tratamento do vazio.
 *
 * Com `forbidNonWhitelisted: true` no ValidationPipe global, qualquer campo nao
 * declarado aqui devolve 400 — inclusive uma tentativa de mandar `config`.
 */
export class UpdateCompanyDto {
  @ApiPropertyOptional({
    description: 'Nome da empresa, como aparece no sistema.',
    example: 'PROVEDOR EXEMPLO',
  })
  @CampoOpcional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description:
      'Endereco do ERP: apenas o host, sem "https://", sem barra final e sem caminho. Alterar este campo dispara um novo preflight.',
    example: 'erp.exemplo.com.br',
  })
  // Sem o `@CampoOpcional()`, `url: null` passava pelo `@IsOptional()` e o
  // `normalizaUrl(null)` gravava host VAZIO: a empresa perdia o endereco do ERP
  // e a resposta era 200. O preflight ainda rodava, contra lugar nenhum.
  @CampoOpcional()
  @IsString()
  @IsNotEmpty()
  url?: string;

  @ApiPropertyOptional({
    description: [
      'Credenciais de acesso ao ERP. Envie apenas quando forem trocar — omitir mantem as atuais.',
      '',
      'Os campos dependem do ERP ja cadastrado (GET /companies/erps lista sempre atualizado):',
      '',
      '- IXC: autorization',
      '- SGP: username, password',
      '- MK: sys, password, cd_servico, masterToken',
      '- HUBSOFT: client_id, username, password (client_secret e opcional)',
      '- GAMAISP: rest_key, login, password',
      '',
      'Alterar este campo dispara um novo preflight. Aceito, a empresa e reativada. Recusado, o que acontece depende de `preflight.causa`: `credencial` e `configuracao` inativam a empresa com o motivo registrado; `inacessivel` (timeout, DNS) NAO inativa uma empresa que ja estava ativa, por ser possivelmente transitorio.',
    ].join('\n'),
    type: 'object',
    additionalProperties: true,
    example: { autorization: '00:0000000000000000000000000000000000000000' },
  })
  // `credenciais: null` nao estourava, mas fazia `dto.credenciais !== undefined`
  // ser verdadeiro e disparava preflight — chamada ao ERP do cliente que
  // ninguem pediu, com poder de inativar a empresa se o ERP piscasse.
  @CampoOpcional()
  @IsObject()
  credenciais?: Record<string, string>;

  @ApiPropertyOptional({
    description: [
      'Produto contratado. Aceita EXATAMENTE um destes dois valores:',
      '',
      '  "disparo"  -> disparo manual, campanhas, templates, historico',
      '  "cobranca" -> tudo acima + dashboard, clientes vencidos, chat',
      '',
      'Definir o plano remove as flags de pagina do modelo antigo (page_*), que teriam precedencia e fariam a troca parecer sem efeito.',
      '',
      'O plano pode ser TROCADO, nunca removido — nao ha valor que o apague.',
      '"" devolve 400, e `null` vale como campo nao enviado: mantem o plano',
      'atual. Sem plano a empresa cai no modelo legado, onde a ausencia LIBERA:',
      'remover entregaria dashboard, clientes vencidos e chat sem venda. Para',
      'reduzir acesso use "disparo"; para devolver tudo, "cobranca" — que libera',
      'as sete paginas, igual ao legado sem flags.',
    ].join('\n'),
    enum: PLANOS,
    example: 'cobranca',
  })
  // O `@CampoOpcional()` e o que torna verdadeira a frase acima. Ate aqui a
  // documentacao afirmava que `null` devolvia 400, e nao devolvia: o
  // `@IsOptional()` pulava a validacao, `montarConfig` gravava `plano: null` e
  // apagava as flags legadas, e `resolvePagePermissions` caia no modelo antigo
  // — onde a AUSENCIA LIBERA. Era a unica forma de uma empresa ganhar
  // dashboard, clientes vencidos e chat sem venda, com 200 na resposta.
  @CampoOpcional()
  @IsIn(PLANOS as unknown as string[])
  plano?: string;

  @ApiPropertyOptional({
    description: [
      'Paginas liberadas ALEM do plano. Substitui a lista atual por completo.',
      'Envie array vazio para remover todos os adicionais; `null` mantem a lista',
      'atual.',
      '',
      'Aceita apenas os nomes abaixo, escritos exatamente assim:',
      '',
      `  ${PAGINAS_IDS.join('\n  ')}`,
    ].join('\n'),
    enum: PAGINAS_IDS,
    isArray: true,
    example: ['clientesVencidos'],
  })
  // O `[]` e que remove os adicionais; `null` nao. Sem o `@CampoOpcional()`,
  // `montarConfig` entrava no `if` e estourava em `null.length` — 500.
  @CampoOpcional()
  @IsArray()
  @IsIn(PAGINAS_IDS as unknown as string[], { each: true })
  paginasExtras?: string[];

  @ApiPropertyOptional({
    description:
      'Ajustes de comunicacao com o ERP. Envie apenas os que quiser mudar.',
    type: AjustesErpDto,
  })
  // O OBJETO inteiro como `null` vale como ausencia, igual ao resto do DTO. A
  // excecao e so DENTRO dele, campo a campo — ver o docblock de `AjustesErpDto`.
  @CampoOpcional()
  @ValidateNested()
  @Type(() => AjustesErpDto)
  ajustes?: AjustesErpDto;

  @ApiPropertyOptional({
    description:
      'Chave PIX de recebimento, usada no botao ORDER_DETAILS do WhatsApp. Os dois campos andam juntos.',
    type: PagamentoPixDto,
  })
  @CampoOpcional()
  @ValidateNested()
  @Type(() => PagamentoPixDto)
  pagamento?: PagamentoPixDto;

  @ApiPropertyOptional({
    description: [
      'Vincula esta empresa a empresa correspondente no CRM. Aceito APENAS em',
      'PATCH /companies/:id (super_admin) — o webhook do CRM devolve 400.',
      '',
      'Existe para as empresas cadastradas antes deste endpoint: sem vinculo, o',
      'CRM nao alcanca a empresa (PATCH /webhooks/companies/:crm_company_id',
      'devolve 404) e nao consegue recadastra-la (o account_chatwoot ja existe,',
      'devolve 409). Para vincular varias de uma vez, use',
      'POST /webhooks/companies/vincular.',
      '',
      'So pode ser DEFINIDO, nunca trocado: com vinculo diferente ja gravado a',
      'resposta e 400. Repontar o vinculo faria o CRM passar a alterar outra',
      'empresa, e o pedido seguinte pareceria ter funcionado.',
    ].join('\n'),
    example: 'CRM-0001',
  })
  // O webhook do CRM recusa este campo com 400 (`dto.crm_company_id !==
  // undefined`), e ate aqui recusava tambem quando ele chegava `null` — ou
  // seja, o chamador que reenviava o registro inteiro sem vinculo preenchido
  // levava 400 acusando uma alteracao de vinculo que ele nao pediu, com uma
  // mensagem mandando usar outro endpoint que nao resolveria nada.
  @CampoOpcional()
  @IsString()
  @IsNotEmpty()
  crm_company_id?: string;

  @ApiPropertyOptional({
    description: [
      'CNPJ da empresa: 14 digitos. Pontuacao e aceita e removida antes de',
      'gravar ("11.222.333/0001-81" vira "11222333000181").',
      '',
      'OPCIONAL. Omitir o campo mantem o CNPJ atual — trocar o nome da empresa',
      'nao deve exigir reenviar o CNPJ. Enviar "" (ou so espacos) tem o MESMO',
      'efeito de omitir: o campo nao e alterado, e a requisicao segue normal.',
      '',
      'Nao ha como LIMPAR o CNPJ, e nao ha 400 por tentar. A coluna e NOT NULL e',
      'a migration `RequireCompanyCnpjAndNotificameToken` trata',
      '`btrim(cnpj) = \'\'` como coluna FALTANDO — logo "limpar" nunca foi um',
      'resultado alcancavel, e um vazio aqui so pode ser ruido do chamador que',
      'reenvia o payload inteiro. Recusa-lo faria um PATCH de `name` falhar por',
      'causa de um campo que ninguem pediu para mudar.',
      '',
      'Valor COM conteudo continua validado com os mesmos digitos verificadores',
      'do cadastro. Antes disso o PATCH aceitava qualquer texto e o service',
      'gravava so o que sobrava dos digitos: "abc" virava "", apagando a chave',
      'PIX em silencio. Isso segue sendo 400.',
      '',
      'E a chave PIX de recebimento quando a empresa nao configura',
      '`pagamento.order_pix_key`. CNPJ errado vira chave PIX errada, e isso nao',
      'aparece no PATCH: aparece semanas depois, como cobranca que nunca chegou.',
    ].join('\n'),
    example: '11222333000181',
  })
  @TextoOpcional()
  @Validate(CnpjValidoConstraint)
  cnpj?: string;

  @ApiPropertyOptional({
    description: [
      'Id do time de cobranca no Chatwoot. Envie "" para limpar.',
      '',
      '`null` NAO limpa: vale como campo nao enviado e mantem o time atual.',
      'Este e o unico campo limpavel onde `null` como "limpar" seria plausivel,',
      'e a resposta e nao — porque `""` ja e o pedido explicito de limpeza, e o',
      '`null` chega de outro lugar: do chamador que reenviou o registro inteiro',
      'com o campo em branco. Tratar os dois igual desligaria o time de cobranca',
      'de uma empresa sem ninguem ter pedido, e a resposta seria 200.',
    ].join('\n'),
    example: '00',
  })
  @CampoOpcional()
  @IsString()
  teamChargeId?: string;

  @ApiPropertyOptional({
    description: 'Token da empresa usado no webhook de agentes do Maestro.',
  })
  @CampoOpcional()
  @IsString()
  @IsNotEmpty()
  token_system_coraxy?: string;

  @ApiPropertyOptional({
    description: [
      'X-Api-Token da conta NotificaMe. E compartilhado entre os canais da',
      'empresa e e a fonte autoritativa do token de TODO envio.',
      '',
      'OPCIONAL — mesma regra do `cnpj`. Omitir mantem o token atual, e enviar',
      '"" (ou so espacos) tem o MESMO efeito de omitir: o campo nao e alterado.',
      '',
      'Nao ha como limpar o token, e nao ha 400 por tentar. A coluna e NOT NULL,',
      'e um token vazio falharia exatamente como o NULL falhava: o worker de',
      'disparo aborta a mensagem com "Empresa sem integracao NotificaMe',
      'configurada". Como esse resultado nunca foi alcancavel, o vazio e tratado',
      'como ruido do chamador, nao como pedido.',
      '',
      'Espacos em volta de um token com conteudo sao removidos antes de gravar.',
    ].join('\n'),
  })
  @TextoOpcional()
  @IsString({ message: 'token_notificameHub deve ser texto.' })
  token_notificameHub?: string;

  @ApiPropertyOptional({
    description:
      'Canais NotificaMe da empresa. Substitui a lista atual por completo. `null` mantem os canais atuais.',
    type: [CanalNotificameDto],
  })
  // A coluna e `jsonb` NOT NULL com default '[]'. Sem o `@CampoOpcional()`,
  // `canais: null` era gravado como NULL e o Postgres derrubava o save — 500
  // tambem, so que vindo do banco em vez de TypeError.
  @CampoOpcional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanalNotificameDto)
  canais?: CanalNotificameDto[];
}
