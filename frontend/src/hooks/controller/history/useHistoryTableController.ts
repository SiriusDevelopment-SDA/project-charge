import { useMemo, useState } from "react";
import { FilterMatchMode, FilterOperator } from "primereact/api";
import { traduzirStatus } from "../../../componente/table/utils/utilsTable";

export type HistoryRow = {
  id: string;
  name?: string;
  number?: string;
  date_dispatch?: string | Date | null;
  status_sent?: string;
  response?: boolean | null;
};

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

        return {
          ...item,
          date_dispatch: item.date_dispatch ? new Date(item.date_dispatch) : null,
          status_label: traduzirStatus(item.status_sent ?? ""),
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
