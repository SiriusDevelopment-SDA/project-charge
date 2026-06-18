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
