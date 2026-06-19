/**
 * Monta o valor do campo `components_maped` (jsonb) do relatório de disparo.
 *
 * Em um envio bem-sucedido, guarda apenas os valores das variáveis enviadas
 * (array) — comportamento histórico. Em uma FALHA, guarda o motivo no mesmo
 * campo (objeto), espelhando o padrão já usado para o motivo de "skip", para
 * que o operador enxergue POR QUE falhou direto no relatório/banco, sem
 * precisar caçar log do servidor.
 *
 * Uma falha acontece quando a NotificaMe responde HTTP não-ok OU quando
 * responde HTTP 200 com `status: "error"` no corpo (a Meta rejeitou a mensagem
 * no momento da submissão). Esse segundo caso antes caía no log de "OK" e o
 * motivo se perdia.
 */
export type DispatchOutcome = {
  /** true quando o envio falhou (HTTP não-ok ou corpo com status "error"). */
  isError: boolean;
  /** Status HTTP retornado pela NotificaMe. */
  httpStatus: number;
  /** Corpo da resposta da NotificaMe (objeto JSON parseado). */
  notificameResponse: unknown;
  /** Valores das variáveis efetivamente mapeados/enviados no template. */
  mappedValues: (string | null)[];
};

export type DispatchComponentsMaped =
  | (string | null)[]
  | {
      error: {
        http_status: number;
        notificame_response: unknown;
      };
      components: (string | null)[];
    };

export function buildDispatchComponentsMaped(
  outcome: DispatchOutcome,
): DispatchComponentsMaped {
  if (!outcome.isError) {
    return outcome.mappedValues;
  }

  return {
    error: {
      http_status: outcome.httpStatus,
      notificame_response: outcome.notificameResponse,
    },
    components: outcome.mappedValues,
  };
}

/**
 * Decide se um envio deve ser considerado falho a partir da resposta da
 * NotificaMe. Centraliza a regra (HTTP não-ok OU corpo com status "error")
 * para o worker e os testes compartilharem a mesma lógica.
 */
export function isFailedDispatch(
  responseOk: boolean,
  resolvedStatus: string,
): boolean {
  return !responseOk || resolvedStatus === 'error';
}

/**
 * Extrai o melhor candidato de identificador de mensagem da resposta de envio
 * da NotificaMe (`POST /v2/channels/whatsapp/messages`), para ser salvo em
 * `relatory.external_message_id` e casar depois com o webhook MESSAGE_STATUS.
 *
 * PROBLEMA QUE RESOLVE: hoje salvamos apenas `result.id` (um UUID). O webhook
 * MESSAGE_STATUS referencia a mensagem por `messageId` (OUTRO UUID) e por
 * `messageStatus.providerMessageId` (base64). O `result.id` não casa com
 * nenhum dos dois, então o status nunca atualiza.
 *
 * A resposta de envio pode trazer o id correto em campos aninhados que variam
 * conforme a versão da API. Tentamos os shapes conhecidos em ordem de
 * preferência e retornamos o primeiro string não-vazio. Se nada casar, voltamos
 * para `result.id` (comportamento histórico) — sem regressão.
 *
 * IMPORTANTE: o campo definitivo só pode ser confirmado com uma amostra crua da
 * resposta em produção (o worker agora loga `result` completo). Esta função é
 * tolerante de propósito: assim que soubermos o campo certo, ele já estará
 * coberto por um dos candidatos abaixo ou bastará adicioná-lo.
 */
export function extractExternalMessageId(
  result: Record<string, unknown>,
): string | undefined {
  if (!result || typeof result !== 'object') return undefined;

  const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

  // 1) Campos diretos comumente usados pela NotificaMe/Meta.
  const direct =
    asString(result.providerMessageId) ??
    asString(result.messageId) ??
    asString((result.messageStatus as Record<string, unknown> | undefined)?.providerMessageId);
  if (direct) return direct;

  // 2) Arrays de mensagens (ex.: { messages: [{ id, providerMessageId }] }).
  const arrays = [result.messages, result.contents, result.results].filter(
    (value): value is unknown[] => Array.isArray(value) && value.length > 0,
  );
  for (const arr of arrays) {
    const first = arr[0] as Record<string, unknown> | undefined;
    const nested =
      asString(first?.providerMessageId) ??
      asString(first?.messageId) ??
      asString(first?.id);
    if (nested) return nested;
  }

  // 3) Fallback histórico: result.id (UUID de submissão).
  return asString(result.id);
}
