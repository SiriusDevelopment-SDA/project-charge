"use client";

import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Tag } from "primereact/tag";
import { Calendar } from "primereact/calendar";
import { FilterX, Search } from "lucide-react";

import "./tableHistory.css";
import { statusSeverity } from "./utils/utilsTable";
import {
  useHistoryTableController,
  type HistoryRow,
} from "../../hooks/controller/history/useHistoryTableController";

type TableProps = {
  data: HistoryRow[];
  className: string;
};

type HistoryTableRow = HistoryRow & {
  date_dispatch: Date | null;
  status_label: string;
  response_label: string;
};

type DateFilterOptions = {
  value: Date | null;
  index: number;
  filterCallback: (value: Date | null, index?: number) => void;
};

export default function Table({ data, className }: TableProps) {
  const {
    filters,
    parsedData,
    globalFilterValue,
    initFilters,
    onGlobalFilterChange,
  } = useHistoryTableController(data);

  const dateFilterTemplate = (options: DateFilterOptions) => (
    <Calendar
      value={options.value}
      onChange={(event) => options.filterCallback(event.value ?? null, options.index)}
      dateFormat="dd/mm/yy"
      showIcon
      mask="99/99/9999"
    />
  );

  const header = (
    <div className="p-datatable-header">
      <div className="flex justify-content-between align-items-center">
        <Button
          icon={<FilterX size={16} className="btn-icon-left" />}
          label="Limpar filtros"
          outlined
          onClick={initFilters}
        />

        <div className="global-search">
          <Search size={16} className="global-search-icon" />
          <InputText
            value={globalFilterValue}
            onChange={(event) => onGlobalFilterChange(event.target.value)}
            placeholder="Busca global..."
            className="global-search-input p-inputtext"
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className={className}>
      <DataTable
        value={parsedData}
        paginator
        rows={8}
        dataKey="id"
        filters={filters}
        filterDisplay="menu"
        globalFilterFields={[
          "name",
          "number",
          "date_dispatch",
          "status_label",
          "response_label",
        ]}
        header={header}
        showGridlines
        scrollable
        scrollHeight="flex"
        emptyMessage="Nenhum registro encontrado"
      >
        <Column field="name" header="Cliente" filter />
        <Column field="number" header="Numero" filter />

        <Column
          field="date_dispatch"
          header="Data/Hora"
          dataType="date"
          body={(row: HistoryTableRow) =>
            row.date_dispatch ? row.date_dispatch.toLocaleString("pt-BR") : "-"
          }
          filter
          filterElement={dateFilterTemplate}
        />
        <Column
          header="Status"
          field="status_sent"
          filterField="status_label"
          body={(row: HistoryTableRow) => (
            <Tag value={row.status_label} severity={statusSeverity(row.status_sent ?? "")} />
          )}
          filter
        />
        <Column
          header="Resposta"
          field="response"
          filterField="response_label"
          body={(row: HistoryTableRow) => row.response_label}
          filter
        />
      </DataTable>
    </div>
  );
}
