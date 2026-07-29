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
] as const;

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
  /** Resumo do preflight recem-executado. */
  readonly preflight?: Record<string, any>;
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

  if (alteracoes.preflight !== undefined) {
    proximo.preflight = alteracoes.preflight;
  }

  return { config: proximo, descartadas, normalizadas };
}
