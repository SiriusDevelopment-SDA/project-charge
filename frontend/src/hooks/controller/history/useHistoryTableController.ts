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
 * Extrai um motivo legível do erro a partir do `components_maped`. A partir do
 * fix do worker, uma falha grava `{ error: { http_status, notificame_response } }`
 * (o corpo da resposta da NotificaMe). Aqui transformamos isso em algo como
 * "HTTP 200 · 131049: Reengagement message limit reached" para o hover do badge.
 * Registros antigos (array de valores, sem `error`) retornam null — não tinham o
 * motivo capturado.
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

  const httpStatus = err.http_status;
  const resp = err.notificame_response as Record<string, unknown> | undefined;
  const inner =
    resp && typeof resp === "object" && resp.error && typeof resp.error === "object"
      ? (resp.error as Record<string, unknown>)
      : resp;

  const code =
    inner?.code ?? inner?.error_code ?? inner?.codigo ?? resp?.code ?? null;
  const title =
    inner?.title ??
    inner?.message ??
    inner?.detail ??
    inner?.description ??
    resp?.message ??
    null;

  const head: string[] = [];
  if (httpStatus != null) head.push(`HTTP ${httpStatus}`);
  if (code != null) head.push(String(code));
  const prefix = head.join(" · ");

  if (title) return prefix ? `${prefix}: ${title}` : String(title);
  if (prefix) return prefix;

  try {
    return JSON.stringify(resp ?? err).slice(0, 300);
  } catch {
    return null;
  }
}

function createInitialFilters() {
  return {
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
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

export function useHistoryTableController(data: HistoryRow[]) {
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
  };

  const onGlobalFilterChange = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      global: { value, matchMode: FilterMatchMode.CONTAINS },
    }));
    setGlobalFilterValue(value);
  };

  return {
    filters,
    parsedData,
    globalFilterValue,
    initFilters,
    onGlobalFilterChange,
  };
}
