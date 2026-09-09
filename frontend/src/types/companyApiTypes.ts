/**
 * Tipos do contrato de companies (super_admin).
 *
 * GET /api/companies retorna a lista visivel apenas para super_admin.
 */

export type CompanyListItem = {
  id: string;
  name: string;
  account_chatwoot: string;
  label: string;
  active: boolean;
};

/**
 * POST /api/companies/:id/reativar
 *
 * Devolve 200 mesmo quando NAO reativa: o ERP recusar a credencial salva e um
 * desfecho previsto. `active` e o campo que decide; `message` explica.
 */
export type ReativarEmpresaResponse = {
  aplicado: boolean;
  active: boolean;
  message: string;
  company?: {
    id: string;
    name: string;
    account_chatwoot: string;
    erp: string;
    url: string;
    active: boolean;
  };
  preflight: {
    status: string;
    causa?: string | null;
    erro?: string | null;
    verificadoEm?: string;
  } | null;
};

/** Uma pagina do produto, como o backend a descreve (`planos.ts`). */
export type PaginaCatalogo = {
  id: string;
  label: string;
  /** Planos que ja incluem esta pagina. */
  planos: string[];
};

/**
 * GET /api/companies/:id/permissoes
 *
 * `plano: null` = empresa LEGADA, ainda nao migrada. As permissoes dela vem das
 * flags `page_*` antigas, e escolher um plano para ela e migracao, nao ajuste.
 *
 * O `catalogo` vem do backend de proposito: a lista de paginas ja viveu em tres
 * lugares e divergiu (ver o docblock de `planos.ts`). A tela renderiza o que o
 * backend disser que existe, e nao mantem copia.
 */
export type PermissoesEmpresaResponse = {
  company: { id: string; name: string; account_chatwoot: string; active: boolean };
  plano: string | null;
  paginasExtras: string[];
  permissoes: Record<string, boolean>;
  catalogo: { planos: string[]; paginas: PaginaCatalogo[] };
};
