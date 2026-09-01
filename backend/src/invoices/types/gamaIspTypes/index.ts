/**
 * Shapes da API da Gama ISP (`https://<host>/api/v1/...`).
 *
 * NAO EXISTE DOCUMENTACAO PUBLICA desta API — tudo aqui foi levantado por
 * sondagem real contra uma instalacao. Por isso as interfaces sao deliberadamente
 * frouxas nos campos que nao usamos e explicitas nos que o disparo depende: o
 * ERP ja devolveu numero onde se esperava string (`id`, `cliente_id`) e null em
 * praticamente todo campo opcional.
 */

/** Booleano da Gama ISP: a API usa as strings "S" e "N", nunca true/false. */
export type GamaIspFlag = 'S' | 'N';

/**
 * Envelope comum a todas as respostas da API.
 *
 * `status` e o UNICO indicador confiavel de sucesso — o HTTP status nao serve:
 * uma pagina grande demais volta com HTTP 200 e corpo HTML de fatal error do PHP
 * (ver `gamaIspInvoicesService.ts`).
 */
export interface GamaIspResponse<T> {
  status?: string;
  data?: T;
  /** Quantidade de itens em `data`. Presente nas listagens. */
  count?: number;
  /** Total de registros existentes. Presente nas listagens. */
  total?: number | string;
}

/** `POST /api/v1/auth` — `data` e o JWT em si, nao um objeto. */
export type GamaIspAuthResponse = GamaIspResponse<string>;

/**
 * Payload do JWT emitido pelo `/api/v1/auth`.
 *
 * O token dura 3 horas e traz o instante de expiracao em `expires` (unix
 * seconds) — e dele que sai o TTL do cache no Redis.
 */
export interface GamaIspJwtPayload {
  expires?: number;
}

/**
 * Fatura de `GET /api/v1/faturas/doc/{cpf_cnpj}`.
 *
 * O registro real tem 36 campos; aqui estao declarados os que a integracao le ou
 * precisa entender para filtrar. O endpoint devolve TODAS as faturas do cliente,
 * PAGAS INCLUSIVE — quem consome precisa filtrar por `data_pagamento` e pelas
 * flags `excluida`/`desativada`.
 */
export interface GamaIspFatura {
  id: number | string;
  cliente_id: number | string | null;
  /** Vira `contract_id` no DTO de disparo. */
  cliente_contrato_id: number | string | null;

  data_emissao: string | null;
  /** Formato ISO `YYYY-MM-DD` — NAO e `DD/MM/YYYY` como no Hubsoft/SGP/MK. */
  data_vencimento: string | null;
  /** Preenchida = fatura paga. `null` enquanto em aberto. */
  data_pagamento: string | null;

  /** Valor como string decimal, ex.: "64.90". */
  valor_total: string | null;
  multa?: string | null;
  juros?: string | null;
  desconto?: string | null;
  valor_recebido?: string | null;

  linha_digitavel: string | null;
  codigo_de_barras: string | null;
  /** BR Code EMV (copia-e-cola), ~197 chars, comeca com "000201". */
  pix_qrcode: string | null;
  /** Sempre null nas amostras coletadas ate agora. */
  url_cobranca_gateway: string | null;

  desativada?: GamaIspFlag | null;
  excluida?: GamaIspFlag | null;
  enviada?: GamaIspFlag | null;
  remessa_gerada?: GamaIspFlag | null;
}

export type GamaIspFaturasResponse = GamaIspResponse<GamaIspFatura[]>;

/**
 * Item do array `contato` de um cliente.
 *
 * Distribuicao real numa amostra de 116 clientes: `tipo_id` 2 (WhatsApp) 96x,
 * 1 (Celular) 70x, 5 (Telefone Fixo) 34x, 3 (Email Pessoal) 13x. Nenhum cliente
 * apareceu sem nenhum contato, mas o codigo nao conta com isso.
 */
export interface GamaIspContato {
  tipo_id: number | string | null;
  tipo?: string | null;
  /** Telefone no formato "(##) ####-####", ou o endereco de email. */
  valor?: string | null;
  descricao?: string | null;
}

/** `endereco` e `cobranca` tem exatamente as mesmas chaves. */
export interface GamaIspEndereco {
  zona?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | number | null;
  complemento?: string | null;
  ponto_ref?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  cidade?: string | null;
  cidade_id?: number | string | null;
  bairro?: string | null;
  bairro_id?: number | string | null;
}

/**
 * Cliente de `POST /api/v1/clientes`.
 *
 * `situacao` observada na amostra: Regular (85), Desativado (17), Cortesia (7),
 * Irregular (5), Bloqueado (2). A sincronizacao NAO filtra por ela — ver
 * `fetchClients` em `gamaIspInvoicesService.ts`.
 */
export interface GamaIspCliente {
  id: number | string;
  nome?: string | null;
  cpf_cnpj?: string | null;
  tipo_pessoa?: 'PF' | 'PJ' | string | null;
  situacao?: string | null;
  data_nascimento?: string | null;

  contato?: GamaIspContato[] | null;
  endereco?: GamaIspEndereco | null;
  cobranca?: GamaIspEndereco | null;
}

export type GamaIspClientesResponse = GamaIspResponse<GamaIspCliente[]>;
