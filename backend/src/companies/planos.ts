/**
 * Planos de produto e o registro de paginas.
 *
 * Nem toda empresa no project-charge faz cobranca ativa. Parte delas usa apenas
 * o disparo (campanhas, templates, disparo manual e historico); dashboard,
 * clientes vencidos e chat sao do produto de cobranca. Isso e uma decisao
 * comercial — a propria tela de bloqueio manda o usuario "entrar em contato com
 * um de nossos vendedores para liberacao do produto de cobranca".
 *
 * Antes disso, o gating era um conjunto de booleanos soltos em `config`
 * (`page_dashboard`, `page_clientesVencidos`, `page_chat`, `page_campanhas`),
 * com tres problemas:
 *
 * 1. `page_campanhas` estava gravado no banco mas NINGUEM lia — a SINTNET
 *    configurou e a pagina continuou visivel.
 * 2. A semantica era opt-out (`!== false`), entao chave ausente ou com typo
 *    liberava a pagina em silencio.
 * 3. A lista de paginas vivia em tres lugares (backend, tipo do frontend e
 *    rotas) e ja tinha divergido.
 *
 * Aqui a lista e unica: adicionar uma pagina e uma entrada em `PAGINAS`, e todas
 * as empresas passam a ter a permissao correta derivada do plano.
 */

export const PLANOS = ['disparo', 'cobranca'] as const;
export type Plano = (typeof PLANOS)[number];

export const PAGINAS_IDS = [
  'disparoManual',
  'campanhas',
  'templates',
  'historico',
  'dashboard',
  'clientesVencidos',
  'chat',
] as const;

export type PaginaId = (typeof PAGINAS_IDS)[number];

export interface PaginaDefinition {
  readonly label: string;
  /** Planos que incluem esta pagina. */
  readonly planos: readonly Plano[];
}

export const PAGINAS: Readonly<Record<PaginaId, PaginaDefinition>> = {
  disparoManual: { label: 'Disparo manual', planos: ['disparo', 'cobranca'] },
  campanhas: { label: 'Campanhas', planos: ['disparo', 'cobranca'] },
  templates: { label: 'Templates', planos: ['disparo', 'cobranca'] },
  historico: { label: 'Historico', planos: ['disparo', 'cobranca'] },
  dashboard: { label: 'Dashboard', planos: ['cobranca'] },
  clientesVencidos: { label: 'Clientes vencidos', planos: ['cobranca'] },
  chat: { label: 'Chat', planos: ['cobranca'] },
};

export type PagePermissions = Record<PaginaId, boolean>;

/**
 * Mapa das flags antigas para os ids de pagina, usado somente no fallback.
 * `page_campanhas` entra aqui de proposito: ele existe no banco e nunca foi
 * lido, entao passar a respeita-lo MUDA o comportamento de quem o gravou. Ver
 * `resolvePagePermissions`.
 */
const FLAGS_LEGADAS: Partial<Record<PaginaId, string>> = {
  dashboard: 'page_dashboard',
  clientesVencidos: 'page_clientesVencidos',
  chat: 'page_chat',
  campanhas: 'page_campanhas',
};

/** Paginas liberadas por um plano, antes de extras. */
function paginasDoPlano(plano: Plano): PagePermissions {
  return PAGINAS_IDS.reduce((acc, id) => {
    acc[id] = PAGINAS[id].planos.includes(plano);
    return acc;
  }, {} as PagePermissions);
}

export function isPlano(valor: unknown): valor is Plano {
  return (PLANOS as readonly string[]).includes(String(valor));
}

/**
 * Resolve as permissoes de pagina de uma empresa.
 *
 * Caminho novo: `config.plano` define a base e `config.paginasExtras` libera
 * excecoes pontuais (util quando o comercial vende um adicional avulso — e o
 * caso de TOPLINK e UPLINK, que sao plano `disparo` com clientes vencidos).
 *
 * Caminho legado: sem `config.plano`, cai nas flags `page_*` com a semantica
 * opt-out de sempre, para as empresas ainda nao migradas continuarem
 * funcionando identicamente. `page_campanhas` e deliberadamente IGNORADO no
 * legado — respeita-lo agora tiraria campanhas de quem usa a pagina hoje. Ele
 * so passa a valer depois que a empresa for migrada para `plano`.
 */
export function resolvePagePermissions(
  config: Record<string, any> | string | null | undefined,
): PagePermissions {
  const cfg = parseConfig(config);

  if (isPlano(cfg.plano)) {
    const permissoes = paginasDoPlano(cfg.plano);

    const extras = Array.isArray(cfg.paginasExtras) ? cfg.paginasExtras : [];
    for (const extra of extras) {
      if ((PAGINAS_IDS as readonly string[]).includes(String(extra))) {
        permissoes[extra as PaginaId] = true;
      }
    }

    return permissoes;
  }

  // Legado: tudo liberado, exceto o que estiver explicitamente `false`.
  return PAGINAS_IDS.reduce((acc, id) => {
    const flag = FLAGS_LEGADAS[id];
    // `campanhas` fica de fora do legado de proposito (ver docstring).
    const respeitaFlag = flag && id !== 'campanhas';
    acc[id] = respeitaFlag ? cfg[flag] !== false : true;
    return acc;
  }, {} as PagePermissions);
}

function parseConfig(
  config: Record<string, any> | string | null | undefined,
): Record<string, any> {
  if (!config) return {};
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  return config;
}
