/**
 * Contrato de declaracao de ERP.
 *
 * Cada service de ERP exporta a sua propria `ErpDefinition`, ao lado do codigo
 * que a implementa — assim a declaracao e a implementacao nao divergem. O
 * registry (`erp.registry.ts`) apenas coleta.
 *
 * Regra ao editar: um flag so vira `true` no mesmo commit que liga a capacidade
 * de verdade. Declarar o que ainda nao existe reproduz exatamente o problema que
 * este registro veio resolver — hoje o service do Hubsoft mapeia `code_pix` e o
 * consumidor descarta o valor, entao na pratica a capacidade nao existe.
 */

/** O que o preflight consegue apurar com UMA chamada barata ao ERP. */
export type ErpPreflightSupport =
  /** Sem service implementado — nao ha o que checar. */
  | 'none'
  /** Valida a credencial, mas a API nao expoe contagem total barata. */
  | 'credential'
  /** Valida a credencial E le a contagem de registros visiveis. */
  | 'counts';

/**
 * Um campo de credencial exigido por um ERP no cadastro.
 *
 * Existe para que o cadastro derive a validacao do registro em vez de manter um
 * `if` por ERP: ao ligar um ERP novo, declarar os campos aqui ja faz o endpoint
 * exigi-los. E, principalmente, e o que permite `config` deixar de ser campo de
 * entrada — hoje o `config` e copiado inteiro entre empresas, foi assim que as
 * credenciais da MEGANETWEB acabaram dentro da UPLINK.
 */
export interface ErpCredentialField {
  /** Nome do campo no payload de cadastro. */
  readonly campo: string;

  /** Onde o valor e persistido na entidade `Company`. */
  readonly destino: 'autorization' | 'config';

  readonly obrigatorio: boolean;

  /** Explicacao exibida no Swagger e na mensagem de erro de validacao. */
  readonly descricao: string;
}

export interface ErpDefinition {
  /** Forma canonica: maiusculas, sem separadores. Ver `normalizeErpCode`. */
  readonly code: string;

  /** Rotulo de exibicao (dropdown do cadastro, painel de saude). */
  readonly label: string;

  /** Sincroniza clientes do ERP para a base local (ClientsSyncCron). */
  readonly syncClients: boolean;

  /** Sincroniza o snapshot de faturas (InvoiceSyncCron). */
  readonly syncInvoices: boolean;

  /** Entrega codigo PIX utilizavel no disparo. */
  readonly pix: boolean;

  /** Tem payload de disparo de template implementado. */
  readonly dispatch: boolean;

  readonly preflight: ErpPreflightSupport;

  /** Credenciais que o cadastro exige para este ERP. Vazio = nenhuma. */
  readonly credenciais: readonly ErpCredentialField[];

  /**
   * Limitacao relevante, exibida ao operador no cadastro. Preencha sempre que o
   * ERP tiver buraco de capacidade, para ninguem cadastrar uma empresa achando
   * que ela vai sincronizar quando nao vai.
   */
  readonly ressalva?: string;
}

/**
 * Converte um `erp` cru para a forma canonica.
 *
 * Normaliza caixa E separadores: a mesma integracao ja apareceu no banco escrita
 * de duas formas ("radiusnet" e "RADIUS NET"). Retorna string vazia para entrada
 * vazia — cabe ao chamador decidir se isso e 400 ou apenas log.
 */
export function normalizeErpCode(raw: string | null | undefined): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
