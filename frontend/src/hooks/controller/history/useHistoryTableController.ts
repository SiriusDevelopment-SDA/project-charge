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

        const statusDetail =
          item.status_sent === 'skipped' && item.message ? item.message : null;
        const detailViews = buildStatusDetailViews(statusDetail);

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
