import { useMemo, useState } from "react";
import { FilterMatchMode, FilterOperator } from "primereact/api";
import { traduzirStatus } from "../../../componente/table/utils/utilsTable";

export type HistoryRow = {
  id: string;
  name?: string;
  number?: string;
  message?: string | null;
  date_dispatch?: string | Date | null;
  status_sent?: string;
  response?: boolean | null;
  // jsonb do relatório: em falha guarda { error: { http_status, notificame_response } }.
  components_maped?: unknown;
};

export type ParsedHistoryRow = HistoryRow & {
  date_dispatch: Date | null;
  status_label: string;
  status_detail: string | null;
  status_detail_preview: string | null;
  status_detail_tooltip: string | null;
  response_label: string;
};

const STATUS_DETAIL_PREVIEW_MAX = 25;

function buildStatusDetailViews(detail: string | null) {
  if (!detail) {
    return { preview: null, tooltip: null };
  }

  const colonIdx = detail.indexOf(":");
  const hasColonSplit = colonIdx >= 0 && colonIdx < detail.length - 1;

  if (hasColonSplit) {
    return {
      preview: detail.slice(0, colonIdx + 1),
      tooltip: detail,
    };
  }

  if (detail.length <= STATUS_DETAIL_PREVIEW_MAX) {
    return { preview: detail, tooltip: null };
  }

  return {
    preview: detail.slice(0, STATUS_DETAIL_PREVIEW_MAX).trimEnd() + "...",
    tooltip: detail,
  };
}

/**
 * Códigos de erro do WhatsApp/Meta mais comuns em disparo de template,
 * traduzidos para uma descrição curta em PORTUGUÊS — para o hover ser
 * compreensível por todos. O dado cru (inglês) segue salvo no banco.
 */
const META_ERROR_PT: Record<string, string> = {
  "131049": "Limite de reengajamento atingido — a Meta limita mensagens de marketing para este número por ora",
  "131048": "Limite de spam atingido — a qualidade do número está baixa",
  "131047": "Reengajamento necessário — a janela de 24h expirou",
  "131026": "Mensagem não entregável — o número pode não ter WhatsApp ou bloqueou o contato",
  "131045": "Número remetente não registrado/configurado corretamente na Meta",
  "131000": "Erro genérico da Meta ao processar a mensagem",
  "130472": "Número faz parte de um experimento da Meta — entrega limitada",
  "132000": "Quantidade de variáveis não confere com o template",
  "132001": "Template não existe nesta WABA (ou está em outro idioma)",
  "132005": "Texto do template (já com as variáveis) ficou longo demais",
  "132007": "Template viola a política de formatação da Meta",
  "132015": "Template pausado pela Meta por baixa qualidade",
  "132016": "Template desabilitado pela Meta por baixa qualidade",
  "133010": "Número não registrado na plataforma",
  "100": "Parâmetro inválido na requisição",
};

/** Erros só de HTTP (quando nem chega a ter código da Meta). */
const HTTP_ERROR_PT: Record<string, string> = {
  "429": "Muitas requisições — limite de envio atingido (envie mais devagar)",
  "400": "Requisição inválida enviada à NotificaMe",
  "401": "Não autorizado — token da NotificaMe inválido",
  "403": "Acesso negado pela NotificaMe",
  "404": "Recurso não encontrado na NotificaMe",
  "500": "Erro interno da NotificaMe",
  "502": "NotificaMe indisponível (gateway)",
  "503": "NotificaMe temporariamente indisponível",
};

/**
 * Extrai um motivo LEGÍVEL EM PORTUGUÊS do erro a partir do `components_maped`.
 * A partir do fix do worker, uma falha grava
 * `{ error: { http_status, notificame_response } }` (corpo da resposta da
 * NotificaMe). Traduzimos o código da Meta/HTTP para PT (mapas acima); se o
 * código for desconhecido, caímos no texto original. Registros antigos (array
 * de valores, sem `error`) retornam null — não tinham o motivo capturado.
 */
function extractErrorReason(components: unknown): string | null {
  if (!components || typeof components !== "object" || Array.isArray(components)) {
    return null;
  }

  const err = (components as Record<string, unknown>).error as
    | Record<string, unknown>
    | undefined;
  if (!err || typeof err !== "object") {
    return null;
  }

  const httpStatus = err.http_status != null ? String(err.http_status) : null;
  const resp = err.notificame_response as Record<string, unknown> | undefined;
  const inner =
    resp && typeof resp === "object" && resp.error && typeof resp.error === "object"
      ? (resp.error as Record<string, unknown>)
      : resp;

  const code =
    inner?.code ?? inner?.error_code ?? inner?.codigo ?? resp?.code ?? null;
  const codeStr = code != null ? String(code) : null;
  const rawTitle =
    inner?.title ??
    inner?.message ??
    inner?.detail ??
    inner?.description ??
    resp?.message ??
    null;

  // 1) Código da Meta conhecido → descrição em PT (+ código para rastreio).
  if (codeStr && META_ERROR_PT[codeStr]) {
    return `${META_ERROR_PT[codeStr]} (cód. ${codeStr})`;
  }

  // 2) Erro só de HTTP conhecido → descrição em PT.
  if (httpStatus && HTTP_ERROR_PT[httpStatus]) {
    return `${HTTP_ERROR_PT[httpStatus]} (HTTP ${httpStatus})`;
  }

  // 3) Código desconhecido: mostra o texto original + referência.
  if (rawTitle) {
    const ref = codeStr
      ? ` (cód. ${codeStr})`
      : httpStatus
        ? ` (HTTP ${httpStatus})`
        : "";
    return `${String(rawTitle)}${ref}`;
  }

  // 4) Último recurso.
  if (httpStatus) return `Falha no envio (HTTP ${httpStatus})`;
  try {
    return JSON.stringify(resp ?? err).slice(0, 300);
  } catch {
    return null;
  }
}

function createInitialFilters() {
  return {
    name: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
    },
    number: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
    },
    date_dispatch: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.DATE_IS }],
    },
    status_label: {
      operator: FilterOperator.OR,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
    },
    response_label: {
      operator: FilterOperator.OR,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
    },
  };
}

type HistoryTableControllerOptions = {
  /**
   * Busca global no SERVIDOR (name/number sobre o conjunto inteiro, via
   * useHistorico.setQuery). O filtro global client-side foi removido: ele só
   * enxergava a página atual, espalhando os resultados entre as páginas.
   */
  onSearch?: (value: string) => void;
};

export function useHistoryTableController(
  data: HistoryRow[],
  options?: HistoryTableControllerOptions,
) {
  const [filters, setFilters] = useState(createInitialFilters);
  const [globalFilterValue, setGlobalFilterValue] = useState("");

  const parsedData = useMemo(
    () =>
      (data ?? []).map((item) => {
        const responseLabel =
          item.response === true
            ? "Respondido"
            : item.response === false
            ? "Sem retorno"
            : "-";

        const skipDetail =
          item.status_sent === 'skipped' && item.message ? item.message : null;
        const errorDetail =
          item.status_sent === 'error'
            ? extractErrorReason(item.components_maped)
            : null;

        // Detalhe completo usado no HOVER do badge (erro + skipped).
        const statusDetail = skipDetail ?? errorDetail;

        // Preview/tooltip inline: mantido apenas para 'skipped' (comportamento
        // atual). Para 'error', o motivo aparece só no hover do badge.
        const detailViews = buildStatusDetailViews(skipDetail);

        return {
          ...item,
          date_dispatch: item.date_dispatch ? new Date(item.date_dispatch) : null,
          status_label: traduzirStatus(item.status_sent ?? ""),
          status_detail: statusDetail,
          status_detail_preview: detailViews.preview,
          status_detail_tooltip: detailViews.tooltip,
          response_label: responseLabel,
        };
      }),
    [data]
  );

  const initFilters = () => {
    setFilters(createInitialFilters());
    setGlobalFilterValue("");
    options?.onSearch?.("");
  };

  const onGlobalFilterChange = (value: string) => {
    setGlobalFilterValue(value);
    options?.onSearch?.(value);
  };

  return {
    filters,
    parsedData,
    globalFilterValue,
    initFilters,
    onGlobalFilterChange,
  };
}
