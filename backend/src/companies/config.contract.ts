import { getErpDefinition } from '../integrations/erp/erp.registry';

/**
 * O contrato do `company.config`, em codigo.
 *
 * A versao narrada esta em `docs/contrato-config-empresa.md`; aqui fica a parte
 * executavel — o que `montarConfig` usa para decidir o que sobrevive a uma
 * escrita.
 *
 * POR QUE ISTO EXISTE
 *
 * O `config` e um `jsonb` livre e, por anos, a unica forma de alterar uma empresa
 * foi `UPDATE` manual no banco. Cada pessoa escreveu o que achou: o levantamento
 * encontrou 22 chaves distintas, das quais 5 nao tinham UMA linha de codigo que
 * as lesse — incluindo `acs`, com senha em claro, e `grand_type`, que era uma
 * tentativa de parametrizar o `grant_type` do OAuth do HUBSOFT com o nome
 * errado. Ninguem percebeu porque, sem contrato, chave errada nao falha: fica la.
 *
 * Escrever isso em codigo so resolve metade. A outra metade e nao existir mais
 * motivo para abrir o psql — por isso o `PATCH /companies/:id`.
 */

/**
 * Escritas pelo proprio sistema durante a operacao. Um PATCH JAMAIS pode
 * derrubar nenhuma delas.
 *
 * `fullClientLoadAt` e `lastClientSyncAt` controlam a janela incremental de
 * sincronizacao de clientes. Foi exatamente perde-las de vista — copiadas de
 * outra empresa num cadastro manual — que deixou TOPLINK e UPLINK meses sem
 * baixar fatura: a empresa nascia em modo incremental, a carga completa nunca
 * rodava, e todas as faturas eram descartadas por falta de cliente.
 */
export const CHAVES_SISTEMA = [
  'fullClientLoadAt',
  'lastClientSyncAt',
  'preflight',
  'crm_company_id',
] as const;

/**
 * Configuradas pelo usuario em telas proprias (promessa de pagamento, Chatwoot).
 * O PATCH de empresa nao as edita, mas tem obrigacao de preserva-las.
 */
export const CHAVES_APLICACAO = [
  'promiseAutomation',
  'chatwoot_admin_token',
  'chatwoot_labels',
] as const;

/**
 * Ajuste fino por empresa, para quando um ERP especifico nao aguenta o padrao.
 * Todas opcionais e com default no codigo que as le.
 */
export const CHAVES_AJUSTE = [
  'timeoutMs',
  'retries',
  'clientsConcurrency',
  'invoicesConcurrency',
  // Janela da sincronizacao de faturas, em dias para tras. Ausente = 1 ano, o
  // default historico. Existe porque em ERP sem filtro de data (Gama ISP) a
  // janela vira distancia a paginar: 1 ano custava de 2 a 4 HORAS por sync.
  // Limites e medicoes em invoices/utils/sync-window.ts.
  'syncLookbackDays',
  // Quantos dias A FRENTE a sincronizacao cobre. Ausente = 31/12 do ano
  // corrente, o default historico. Nao reduz custo de varredura; existe porque o
  // 31/12 fixo encolhe ao longo do ano, salta na virada e cria um ponto cego em
  // dezembro. Ver invoices/utils/sync-window.ts.
  'syncLookaheadDays',
] as const;

/**
 * Tipos de chave PIX que a Meta aceita em
 * `order_details.payment_settings[].pix_dynamic_code.key_type`.
 *
 * A lista e da Meta, nao nossa: qualquer valor fora dela faz o template ser
 * RECUSADO — e recusado tarde, ver `CHAVES_PAGAMENTO`. `EVP` e a chave
 * aleatoria; nao existe `RANDOM` nem `ALEATORIA` para a Meta.
 */
export const TIPOS_CHAVE_PIX = [
  'CNPJ',
  'CPF',
  'EMAIL',
  'PHONE',
  'EVP',
] as const;

export type TipoChavePix = (typeof TIPOS_CHAVE_PIX)[number];

/** `true` quando o valor e um dos tipos de chave PIX aceitos pela Meta. */
export function ehTipoChavePix(valor: unknown): valor is TipoChavePix {
  return (
    typeof valor === 'string' &&
    (TIPOS_CHAVE_PIX as readonly string[]).includes(valor)
  );
}

/**
 * Chave PIX de recebimento da empresa, usada para montar o botao
 * `ORDER_DETAILS` do WhatsApp (`payment-promise/payment-promise.cron.ts`).
 *
 * NAO e ajuste fino de ERP e nao entra em `CHAVES_AJUSTE` por dois motivos: o
 * grupo de ajuste e inteiramente numerico (`AlteracoesConfig.ajustes` e
 * `Record<string, number>`) e trata de como falamos com o ERP, enquanto isto e
 * texto e trata de como o cliente PAGA. Enfiar uma chave PIX la obrigaria a
 * afrouxar o tipo de todo o grupo para `number | string`, e a validacao de
 * `timeoutMs` e companhia passaria a aceitar texto.
 *
 * POR QUE PRECISOU EXISTIR
 *
 * A Meta exige `key` E `key_type` dentro de `pix_dynamic_code`. Sem os dois, a
 * resposta e:
 *
 *   CODE: 100 — violated JSON schema constraint 'required' ... missing 'key',
 *   missing 'key_type'
 *
 * O modo de falha e o pior possivel: o NotificaMe aceita o disparo e devolve
 * `status: queued` com HTTP 200; a recusa vem depois, da Meta, e o operador ve
 * a mensagem enfileirada que simplesmente nunca chega. Ate aqui a chave so
 * podia vir do CNPJ da empresa e NAO havia como configura-la — chave PIX de
 * e-mail, telefone ou aleatoria era inalcancavel pelo cadastro.
 */
export const CHAVES_PAGAMENTO = ['order_pix_key', 'order_pix_key_type'] as const;

/**
 * O minimo que `resolverChavePix` precisa da empresa. Estrutural de proposito:
 * quem chama passa uma `Company` inteira, mas depender da entidade aqui
 * amarraria o contrato ao TypeORM e tornaria o teste refem de 27 colunas
 * irrelevantes.
 */
export type EmpresaComChavePix = {
  cnpj?: string | null;
  config?: Record<string, unknown> | string | null;
};

/**
 * Chave PIX encontrada para uma empresa. CANDIDATA: `keyType` vem cru, do jeito
 * que foi configurado, e quem valida contra `TIPOS_CHAVE_PIX` e quem monta o
 * botao — o unico lugar que sabe dizer no log qual valor foi recusado.
 */
export type ChavePixCandidata = { key: string; keyType: string };

/**
 * A chave PIX de recebimento de uma empresa, para o botao ORDER_DETAILS.
 *
 * FONTE UNICA dos DOIS construtores de `pix_dynamic_code`:
 * `payment-promise/payment-promise.cron.ts` (lembrete de promessa) e
 * `templates/template-dispatch-payload.service.ts` (disparo manual e
 * campanhas). Os dois divergiam — um assumia `CNPJ` por default, o outro
 * adivinhava o tipo pelo formato da chave — e as duas divergencias produziam
 * payload recusado pela Meta.
 *
 * Duas origens, nesta ordem:
 *
 * 1. `config.order_pix_key` + `config.order_pix_key_type` — a SOBREPOSICAO, e a
 *    excecao. Existe para a empresa que registrou no PSP uma chave de e-mail,
 *    telefone ou aleatoria. Quase nenhuma configura.
 * 2. A coluna `cnpj` da empresa, com tipo `CNPJ`. E o caso NORMAL do negocio,
 *    nao um fallback de emergencia: as empresas cobram no proprio CNPJ, e o
 *    fluxo de disparo em producao ja monta o botao assim (`key_type: "CNPJ"`
 *    fixo). E tambem o unico lugar onde o tipo pode ser afirmado sem ninguem
 *    ter dito qual e — a coluna ja significa "isto e um CNPJ". Por isso o
 *    `cnpj` e obrigatorio no cadastro, com digitos verificadores conferidos:
 *    ele nao e dado cadastral decorativo, e a chave por onde o dinheiro entra.
 *
 * O tipo NUNCA e deduzido do formato da chave. Um CPF e um telefone sem DDI tem
 * ambos 11 digitos; errar o tipo produz um payload que a Meta aceita e o banco
 * do cliente recusa — pior do que nao mandar.
 *
 * POR QUE NAO EXISTE CHAVE PADRAO — E POR QUE ISSO E INEGOCIAVEL
 *
 * Empresa sem chave e sem CNPJ devolve `null` daqui, e quem monta o botao NAO o
 * monta: o disparo e pulado com log em WARN nomeando o que falta. Nao ha, e nao
 * pode haver, um valor de reserva.
 *
 * O motivo nao e teorico. O fluxo n8n que dispara este mesmo template hoje tem
 * um default embutido no payload:
 *
 *   "key": "{{ $('Start').first().json.company.cnpj ?? "17047165000111" }}"
 *
 * Aquele numero e o CNPJ de UMA das empresas. Toda empresa sem CNPJ preenchido
 * que passasse por ali cobraria na chave PIX de outra — o cliente pagaria, o
 * dinheiro cairia na conta errada, e ninguem receberia erro nenhum: a Meta
 * aceita, o PSP aceita, a chave existe. So nao e a chave de quem cobrou. Ate
 * este momento, 7 das 12 empresas estavam sem CNPJ, ou seja, o default era o
 * caminho comum e nao a excecao.
 *
 * "Sem chave" precisa ser um resultado visivel e barulhento. Preencher o vazio
 * com qualquer coisa aqui nao e conveniencia: e transferencia silenciosa de
 * dinheiro entre clientes.
 */
export function resolverChavePix(
  empresa?: EmpresaComChavePix | null,
): ChavePixCandidata | null {
  const config = lerConfigDaEmpresa(empresa?.config);

  const chaveConfigurada = String(config.order_pix_key ?? '').trim();
  if (chaveConfigurada) {
    // Chave configurada com tipo invalido NAO volta para o CNPJ: cobrar numa
    // chave diferente da que alguem configurou manda o dinheiro para outra
    // conta. O tipo cru segue adiante e quem monta o botao recusa nomeando o
    // valor — descarta-lo aqui faria o log acusar "chave ausente" justamente
    // para quem acabou de configurar uma.
    return {
      key: chaveConfigurada,
      keyType: String(config.order_pix_key_type ?? '')
        .trim()
        .toUpperCase(),
    };
  }

  const cnpj = String(empresa?.cnpj ?? '').replace(/\D/g, '');
  return cnpj ? { key: cnpj, keyType: 'CNPJ' } : null;
}

/** `config` e um `jsonb` livre e ja apareceu como string JSON no banco. */
function lerConfigDaEmpresa(
  config: Record<string, unknown> | string | null | undefined,
): Record<string, unknown> {
  if (!config) return {};
  if (typeof config === 'string') {
    try {
      return JSON.parse(config) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return config;
}

/** Permissao de pagina no modelo atual. */
export const CHAVES_PLANO = ['plano', 'paginasExtras'] as const;

/**
 * Modelo de permissao LEGADO, semantica invertida (ausente libera, `false`
 * bloqueia). Continua reconhecido porque empresas antigas dependem dele — ver
 * `resolvePagePermissions`. Nao usar em cadastro novo.
 */
export const CHAVES_PAGINA_LEGADO = [
  'page_dashboard',
  'page_clientesVencidos',
  'page_chat',
  'page_campanhas',
] as const;

/**
 * Apelidos historicos do token do Chatwoot. A leitura aceita os tres
 * (`auth.service.ts`), a escrita so produz `chatwoot_admin_token`. Sao
 * reconhecidos para nao quebrar cadastro antigo, e normalizados no primeiro
 * PATCH que a empresa receber.
 */
const APELIDOS_TOKEN_CHATWOOT = [
  'chatwoot_app_token',
  'chatwoot_token_admin',
] as const;

/**
 * Toda chave que o contrato reconhece para um ERP.
 *
 * As credenciais entram por ERP: `username`/`password` sao OBRIGATORIAS no SGP e
 * lixo numa empresa IXC, que autentica pela coluna `autorization`. Um conjunto
 * fixo para todos os ERPs apagaria credencial de uns ou preservaria lixo de
 * outros.
 */
export function chavesConhecidas(erp: string): Set<string> {
  const definicao = getErpDefinition(erp);
  const credenciais = (definicao?.credenciais ?? [])
    .filter((c) => c.destino === 'config')
    .map((c) => c.campo);

  return new Set<string>([
    ...credenciais,
    ...CHAVES_SISTEMA,
    ...CHAVES_APLICACAO,
    ...CHAVES_AJUSTE,
    ...CHAVES_PAGAMENTO,
    ...CHAVES_PLANO,
    ...CHAVES_PAGINA_LEGADO,
    ...APELIDOS_TOKEN_CHATWOOT,
  ]);
}

/** Chaves presentes no config que o contrato nao reconhece. */
export function chavesDesconhecidas(
  config: Record<string, any>,
  erp: string,
): string[] {
  const conhecidas = chavesConhecidas(erp);
  return Object.keys(config ?? {}).filter((k) => !conhecidas.has(k));
}

export type AlteracoesConfig = {
  /** Credenciais cujo `destino` e `config`. Substitui as atuais quando enviado. */
  readonly credenciais?: Record<string, string>;
  readonly plano?: string;
  readonly paginasExtras?: string[];
  readonly ajustes?: Record<string, number>;
  /**
   * Sobreposicao da chave PIX de recebimento — a excecao; o caso normal e o
   * CNPJ da empresa, resolvido em `resolverChavePix`.
   *
   * Campo enviado como `''` LIMPA a chave, e limpar `order_pix_key` leva
   * `order_pix_key_type` junto. ATENCAO: esse caminho NAO E MAIS ALCANCAVEL
   * PELA API. Desde que `PagamentoPixDto` passou a usar `@TextoOpcional()`, um
   * `''` vindo do HTTP vira `undefined` antes de chegar aqui, e o PATCH deixou
   * de ter como remover a sobreposicao — decisao registrada no docblock daquela
   * classe (apagar chave de recebimento por engano manda a cobranca para o
   * lugar errado).
   *
   * A limpeza continua implementada aqui de proposito: e o unico ponto do
   * sistema que sabe remover as duas chaves de forma coerente, e um caminho
   * explicito e nomeado — se um dia for preciso desfazer uma sobreposicao —
   * deve reusar isto, nao reinventar.
   */
  readonly pagamento?: {
    readonly order_pix_key?: string;
    readonly order_pix_key_type?: string;
  };
  /** Resumo do preflight recem-executado. */
  readonly preflight?: Record<string, any>;
  /**
   * Vinculo com a empresa no CRM.
   *
   * Chave de sistema, mas com uma diferenca: as outras o backend escreve
   * sozinho, esta alguem precisa informar uma vez. Quem decide SE pode ser
   * escrita e o servico — aqui ela so e aplicada.
   */
  readonly crmCompanyId?: string;
};

export type ResultadoConfig = {
  readonly config: Record<string, any>;
  /** Chaves fora do contrato que foram descartadas — nunca em silencio. */
  readonly descartadas: string[];
  /** Apelidos do token do Chatwoot que foram consolidados. */
  readonly normalizadas: string[];
};

/**
 * Reconstroi o `config` a partir do atual mais as alteracoes pedidas.
 *
 * Tres coisas acontecem aqui, e as tres sao o ponto do contrato existir:
 *
 * 1. O que o sistema escreve e o que outras telas configuram e PRESERVADO.
 * 2. O que foi pedido e aplicado, por campo nomeado — nunca `config` cru.
 * 3. O que o contrato nao reconhece e DESCARTADO, e sai na lista `descartadas`.
 *
 * O descarte e o que faz cada PATCH deixar a empresa mais limpa do que estava,
 * em vez de sedimentar mais uma camada. E devolver a lista, em vez de sumir com
 * as chaves caladamente, e o que permite alguem discordar do descarte.
 */
export function montarConfig(
  configAtual: Record<string, any>,
  alteracoes: AlteracoesConfig,
  erp: string,
): ResultadoConfig {
  const atual = configAtual ?? {};
  const conhecidas = chavesConhecidas(erp);
  const descartadas = Object.keys(atual).filter((k) => !conhecidas.has(k));

  const proximo: Record<string, any> = {};
  for (const chave of Object.keys(atual)) {
    if (conhecidas.has(chave)) proximo[chave] = atual[chave];
  }

  // Normaliza os apelidos ANTES de qualquer outra escrita: se um dia um apelido
  // sair da lista de conhecidas, o token seria descartado em vez de migrado.
  const normalizadas: string[] = [];
  for (const apelido of APELIDOS_TOKEN_CHATWOOT) {
    if (proximo[apelido] === undefined) continue;
    if (proximo.chatwoot_admin_token === undefined) {
      proximo.chatwoot_admin_token = proximo[apelido];
    }
    delete proximo[apelido];
    normalizadas.push(apelido);
  }

  if (alteracoes.credenciais) {
    const definicao = getErpDefinition(erp);
    for (const campo of definicao?.credenciais ?? []) {
      if (campo.destino !== 'config') continue;
      const valor = String(alteracoes.credenciais[campo.campo] ?? '').trim();
      if (valor) proximo[campo.campo] = valor;
    }
  }

  if (alteracoes.plano !== undefined) {
    proximo.plano = alteracoes.plano;

    // Trocar de plano remove as flags legadas: manter as duas convivendo faria
    // `resolvePagePermissions` cair no caminho antigo e ignorar o plano recem
    // -definido — a alteracao pareceria nao ter surtido efeito.
    for (const legada of CHAVES_PAGINA_LEGADO) delete proximo[legada];
  }

  // NAO EXISTE REMOVER O PLANO, e a ausencia de um `delete` aqui e deliberada.
  //
  // Tirar `plano` nao devolve a empresa a um estado neutro: devolve ao legado,
  // onde ausencia LIBERA. Seria a unica operacao do sistema capaz de entregar
  // dashboard, clientes vencidos e chat sem ninguem ter vendido — exatamente o
  // que a obrigatoriedade do plano no cadastro existe para impedir.
  //
  // O legado e rampa de compatibilidade para empresa antiga, nao destino:
  // legado -> plano, nunca de volta. Para reduzir o que uma empresa enxerga,
  // troque para `disparo`; para devolver tudo, `cobranca` — que libera as sete
  // paginas, o mesmo que o legado sem flags dava, so que por decisao em vez de
  // por omissao.
  //
  // Antes de adicionar remocao aqui, saiba que ela nao restaura nada: promove
  // a empresa a "tudo liberado" com outro nome.

  if (alteracoes.paginasExtras !== undefined) {
    if (alteracoes.paginasExtras.length) {
      proximo.paginasExtras = alteracoes.paginasExtras;
    } else {
      delete proximo.paginasExtras;
    }
  }

  if (alteracoes.ajustes) {
    for (const [chave, valor] of Object.entries(alteracoes.ajustes)) {
      if (valor === undefined || valor === null) {
        delete proximo[chave];
      } else {
        proximo[chave] = valor;
      }
    }
  }

  // O TIPO e resolvido ANTES da chave, de proposito: assim um pedido que limpa
  // a chave (`order_pix_key: ''`) e define um tipo na mesma chamada termina com
  // os dois removidos, em vez de deixar um tipo orfao apontando para uma chave
  // que nao existe mais.
  if (alteracoes.pagamento) {
    const { order_pix_key: chavePix, order_pix_key_type: tipoPix } =
      alteracoes.pagamento;

    if (tipoPix !== undefined) {
      const valor = tipoPix.trim().toUpperCase();
      if (valor) proximo.order_pix_key_type = valor;
      else delete proximo.order_pix_key_type;
    }

    if (chavePix !== undefined) {
      const valor = chavePix.trim();
      if (valor) {
        proximo.order_pix_key = valor;
      } else {
        delete proximo.order_pix_key;
        delete proximo.order_pix_key_type;
      }
    }
  }

  if (alteracoes.preflight !== undefined) {
    proximo.preflight = alteracoes.preflight;
  }

  if (alteracoes.crmCompanyId !== undefined) {
    proximo.crm_company_id = alteracoes.crmCompanyId;
  }

  return { config: proximo, descartadas, normalizadas };
}
