/**
 * Classificacao de falha de ERP no momento do DISPARO.
 *
 * PROBLEMA QUE RESOLVE: o preload de faturas do disparo chama o ERP ao vivo,
 * cliente por cliente, dentro de um try/catch. Ate esta correcao qualquer
 * excecao virava lista vazia, e lista vazia era indistinguivel de "o cliente
 * quitou" — a campanha se marcava como executada e sumia pelo resto do dia.
 * Para o agendador poder decidir entre "tente de novo" e "conclua", a falha
 * precisa chegar la classificada.
 *
 * VOCABULARIO: `cause` usa os MESMOS tres valores do preflight de cadastro
 * (`PreflightCausa` em `erp-preflight.service.ts`) de proposito — quem le o log
 * de uma campanha e quem le o motivo gravado numa empresa inativa e a mesma
 * pessoa, e nao ha ganho em ter dois vocabularios para a mesma coisa.
 *
 * POR QUE NAO REUSA `ErpPreflightService.classificaCausa`: o mapeamento e
 * deliberadamente DIFERENTE, porque o contexto e outro.
 *
 *   - No cadastro, 5xx e corpo nao-JSON sao tratados como `configuracao`
 *     permanente: a URL provavelmente aponta para o portal em vez da API, e
 *     tratar isso como instabilidade esconderia um erro que nunca passa (ver o
 *     docblock de `classificaCausa`).
 *   - No disparo, aquela mesma URL JA foi validada pelo preflight no cadastro e
 *     a empresa ja vinha funcionando. Um 5xx ou um fatal error do PHP aqui e o
 *     ERP quebrando agora — exatamente o caso em que repetir daqui a pouco
 *     resolve.
 *
 * Os dois tambem nao leem as mesmas mensagens: o preflight so ve os erros que
 * ele mesmo levanta (`HTTP nnn: ...`), enquanto aqui chegam os cinco formatos
 * dos adapters de ERP, um por integracao.
 */

export type ErpFailureCause =
  /** O ERP respondeu e recusou a credencial. Fato estavel. */
  | 'credencial'
  /** Nao foi possivel obter os dados: sem resposta, 5xx, corpo quebrado. */
  | 'inacessivel'
  /** O ERP respondeu algo que nao sustenta a integracao, ou falta dado nosso. */
  | 'configuracao';

export interface ErpFailure {
  readonly cause: ErpFailureCause;

  /**
   * A falha tem chance de passar sozinha?
   *
   * `true` autoriza o agendador a manter a campanha pendente e tentar de novo.
   * `false` significa que repetir so gera ruido: alguem precisa mexer no
   * cadastro ou no dado do cliente.
   */
  readonly transient: boolean;

  /** Status HTTP extraido da mensagem do adapter, quando havia um. */
  readonly httpStatus: number | null;

  /** Mensagem tecnica resumida, para log e para o relatorio de disparo. */
  readonly message: string;
}

/**
 * Sinais de que nao houve resposta do outro lado: timeout, DNS, conexao
 * recusada. `falha de rede` cobre as mensagens que o MK e a Gama ISP montam
 * quando o `fetch` levanta.
 */
const SEM_RESPOSTA =
  /timeout|abort|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|fetch failed|falha de rede/i;

/**
 * O ERP respondeu, mas com um corpo que nao da para usar.
 *
 * O caso concreto e a Gama ISP: quando a consulta e grande demais ela devolve
 * HTTP 200 com o fatal error do PHP em HTML. O IXC e o SGP chamam
 * `response.json()` direto, entao o mesmo tipo de resposta chega aqui como o
 * `SyntaxError` do proprio Node.
 */
const CORPO_INVALIDO =
  /nao e JSON|não é JSON|is not valid JSON|Unexpected token|JSON at position|nao retornou status "success"|não retornou status "success"/i;

/**
 * Status HTTP dentro da mensagem do adapter. Cada integracao formata do seu
 * jeito e nenhuma delas propaga o status em campo proprio (todas embrulham em
 * `BadRequestException`, cujo status e sempre 400):
 *
 *   IXC / SGP / HUBSOFT  `Erro no ERP (IXC): 401 -> ...`
 *   MK                   `[MK] faturas abertas erro 500: ...`
 *   GAMAISP              `[GAMAISP] faturas por documento: HTTP 500 -> ...`
 */
const PADROES_STATUS: RegExp[] = [
  /HTTP\s+(\d{3})\b/i,
  /\berro\s+(\d{3})\b/i,
  /:\s*(\d{3})\s*->/,
];

const MENSAGEM_MAX = 300;

function mensagemDe(err: unknown): string {
  const bruto =
    err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err ?? '');
  return bruto.trim().slice(0, MENSAGEM_MAX);
}

function statusHttp(mensagem: string): number | null {
  for (const padrao of PADROES_STATUS) {
    const achado = padrao.exec(mensagem);
    if (achado) {
      const status = Number(achado[1]);
      if (Number.isFinite(status)) return status;
    }
  }
  return null;
}

/**
 * Traduz a excecao de um adapter de ERP em uma decisao de disparo.
 *
 * Regra de ouro do caso desconhecido: **nao e transitorio**. Erro sem status e
 * sem sinal de rede costuma ser problema do dado de UM cliente — o
 * `[GAMAISP] Cliente sem CPF/CNPJ` e o exemplo vivo. Se isso segurasse a
 * campanha, um unico cadastro torto adiaria o disparo de todo mundo, que e
 * pior do que o defeito original.
 */
export function classifyErpFailure(err: unknown): ErpFailure {
  const message = mensagemDe(err);
  const nome = (err as { name?: string })?.name ?? '';

  if (nome === 'TimeoutError' || nome === 'AbortError' || SEM_RESPOSTA.test(message)) {
    return { cause: 'inacessivel', transient: true, httpStatus: null, message };
  }

  const httpStatus = statusHttp(message);

  // ANTES do status de proposito: o caso classico e a Gama ISP devolvendo HTTP
  // 200 com o fatal error do PHP. Ler o status primeiro classificaria esse 200
  // como resposta legitima e mataria a campanha.
  if (err instanceof SyntaxError || CORPO_INVALIDO.test(message)) {
    return { cause: 'inacessivel', transient: true, httpStatus, message };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    // Os adapters que renovam token (MK) ja tentaram de novo antes de chegar
    // aqui. Um 401 nesta altura e credencial errada mesmo.
    return { cause: 'credencial', transient: false, httpStatus, message };
  }

  if (httpStatus !== null && (httpStatus >= 500 || httpStatus === 408 || httpStatus === 429)) {
    // 5xx: o ERP caiu. 408/429: ele esta vivo mas nao consegue atender agora.
    return { cause: 'inacessivel', transient: true, httpStatus, message };
  }

  if (httpStatus !== null && httpStatus >= 400) {
    // Demais 4xx (404 a frente): o ERP respondeu com algo que a integracao nao
    // sustenta. Repetir nao muda a resposta.
    return { cause: 'configuracao', transient: false, httpStatus, message };
  }

  return { cause: 'configuracao', transient: false, httpStatus, message };
}

/**
 * Texto curto para o relatorio de disparo, sem jargao de stack trace.
 *
 * Vai para a coluna que o operador le, entao aqui — e so aqui neste arquivo — o
 * texto e acentuado, como no resto das mensagens de relatorio.
 */
export function describeErpFailure(failure: ErpFailure): string {
  const detalhe = failure.message ? ` Detalhe do ERP: ${failure.message}` : '';

  switch (failure.cause) {
    case 'credencial':
      return `O ERP recusou a credencial no momento do disparo. Revise a integração da empresa.${detalhe}`;
    case 'inacessivel':
      return `O ERP não respondeu no momento do disparo, então não foi possível confirmar a fatura deste cliente.${detalhe}`;
    default:
      return `Não foi possível consultar a fatura deste cliente no ERP.${detalhe}`;
  }
}
