import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';

/**
 * Decisoes do webhook da NotificaMe, isoladas do banco e do HTTP.
 *
 * Estava tudo dentro do controller: mapa de status, resolucao de empresa por
 * canal e duas clausulas SQL escritas a mao — 338 linhas com tres repositorios
 * injetados e nenhum teste. Nada disso e responsabilidade de um controller, e
 * nada disso era verificavel sem subir Postgres.
 *
 * O que mora aqui e o que se decide olhando so o payload. Persistencia fica no
 * service; a borda HTTP, no controller.
 */

export type NotificaMeMessageContent = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type NotificaMeMessagePayload = {
  id?: string;
  from?: string;
  to?: string;
  contents?: NotificaMeMessageContent[];
  timestamp?: string;
  visitor?: { name?: string; [key: string]: unknown };
  [key: string]: unknown;
};

export type NotificaMeMessageStatus = {
  timestamp?: string;
  code?: string;
  description?: string;
  providerMessageId?: string;
};

export type NotificaMeWebhookPayload = {
  type?: string;
  id?: string;
  timestamp?: string;
  subscriptionId?: string;
  channel?: string;
  direction?: string;
  messageId?: string;
  contentIndex?: number;
  messageStatus?: NotificaMeMessageStatus;
  from?: string;
  message?: NotificaMeMessagePayload;
  providerMessageId?: string;
  [key: string]: unknown;
};

export type StatusDeEnvio = RelatoryDispatchTemplate['status_sent'];

export const STATUS_CODE_MAP: Record<string, StatusDeEnvio> = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
  ERROR: 'error',
  REJECTED: 'error',
  UNDELIVERED: 'failed',
};

/**
 * Traduz o codigo do provedor para o status do relatorio.
 *
 * `null` significa "codigo que nao sabemos tratar" — e o chamador registra e
 * ignora, em vez de gravar um status inventado por cima de um envio real.
 */
export function traduzirCodigoDeStatus(code: unknown): StatusDeEnvio | null {
  const normalizado = String(code ?? '').toUpperCase();
  return STATUS_CODE_MAP[normalizado] ?? null;
}

/**
 * `delivered` e `read` sao a prova de que a mensagem chegou; e por isso que
 * contam como resposta no relatorio.
 */
export function statusIndicaResposta(status: StatusDeEnvio): boolean {
  return status === 'delivered' || status === 'read';
}

export function statusIndicaFalha(status: StatusDeEnvio): boolean {
  return status === 'error' || status === 'failed';
}

/**
 * Ids que podem identificar a mensagem no MESSAGE_STATUS, na ordem de
 * preferencia. Vazio significa evento sem identificador — nao da para casar
 * com relatorio nenhum.
 */
export function extrairIdsDeMensagem(body: NotificaMeWebhookPayload): string[] {
  return [body.messageStatus?.providerMessageId, body.messageId]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
}

/**
 * Ids de contexto de canal do evento.
 *
 * Sem ao menos um, o evento NAO pode ser processado: o telefone sozinho casaria
 * com o relatorio de qualquer empresa que tenha falado com aquele numero.
 */
export function extrairIdsDeContextoDeCanal(
  body: NotificaMeWebhookPayload,
): string[] {
  const identifiers = [body.channel, body.subscriptionId]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  return [...new Set(identifiers)];
}

export type ClausulaSql = { clause: string; params: Record<string, string> };

/**
 * Monta a clausula WHERE que casa `relatory.number` com um telefone local
 * (DDD + assinante, sem o prefixo de pais 55), tolerando que o valor
 * armazenado tenha ou nao o 55 e qualquer formatacao.
 *
 * Estrategia: normaliza a coluna para apenas digitos, remove um 55 inicial
 * quando o numero tem >= 12 digitos (telefone BR com pais) e compara os
 * ultimos N digitos significativos (N = tamanho do telefone local recebido,
 * minimo 10) com o `localFrom`. Exigir >= 10 digitos evita falso-positivo
 * entre numeros curtos. O escopo de empresa/canal (clausula de containment)
 * ja impede match cruzado entre tenants.
 */
export function montarClausulaDeTelefoneLocal(localFrom: string): ClausulaSql {
  // localFrom ja vem so com digitos (localPhoneDigits). Se vier invalido
  // (curto demais), forca no-match para nao casar errado.
  if (!localFrom || localFrom.length < 10) {
    return { clause: '1 = 0', params: {} };
  }

  // digitos da coluna
  const colDigits = `regexp_replace(relatory.number, '[^0-9]', '', 'g')`;
  // digitos locais da coluna (remove um 55 inicial quando tem pais)
  const colLocal = `CASE
        WHEN LEFT(${colDigits}, 2) = '55' AND LENGTH(${colDigits}) >= 12
        THEN SUBSTRING(${colDigits} FROM 3)
        ELSE ${colDigits}
      END`;

  // Compara pelos ultimos N digitos, onde N = menor comprimento entre o
  // telefone local da coluna e o recebido (simetrico: casa mesmo que um lado
  // tenha um digito a mais, ex. 9o digito). Exige N >= 10 para nao casar
  // numeros curtos por engano (DDD + assinante).
  const minLen = `LEAST(LENGTH(${colLocal}), LENGTH(:localFrom))`;
  return {
    clause: `${minLen} >= 10 AND RIGHT(${colLocal}, ${minLen}) = RIGHT(:localFrom, ${minLen})`,
    params: { localFrom },
  };
}

/**
 * Monta a clausula WHERE que resolve a empresa cujo array jsonb
 * `canalId_notificameHub` contem ALGUM dos ids de contexto do webhook.
 *
 * Usa o operador de containment `@>` do Postgres por id de canal, em OR.
 * Ex.: `company.canalId_notificameHub @> '[{"id":"<channel>"}]'`.
 *
 * O alias `company` e usado em ambas as queries (relatory join e company).
 */
export function montarClausulaDeCanalDaEmpresa(
  channelContextIds: string[],
): ClausulaSql {
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  channelContextIds.forEach((channelId, index) => {
    const key = `channelCtx${index}`;
    // jsonb containment: o array da empresa contem um objeto com este id.
    conditions.push(
      `company."canalId_notificameHub" @> jsonb_build_array(jsonb_build_object('id', CAST(:${key} AS text)))`,
    );
    params[key] = channelId;
  });

  return {
    // Se nao houver contexto, forca no-match (callers ja tratam length === 0).
    clause: conditions.length ? `(${conditions.join(' OR ')})` : '1 = 0',
    params,
  };
}

/** Primeiro conteudo de texto da mensagem, ou `null` quando nao ha nenhum. */
export function extrairTextoDaMensagem(
  message: NotificaMeMessagePayload | undefined,
): string | null {
  const contents = Array.isArray(message?.contents) ? message.contents : [];
  return contents.find((c) => c.type === 'text')?.text ?? null;
}
