"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Tag } from "primereact/tag";
import { Calendar } from "primereact/calendar";
import { FilterMatchMode, FilterOperator } from "primereact/api";
import { FilterX, Search } from "lucide-react";

import "./tableHistory.css";

export default function AdvancedFilterDemo({ data }: { data: any[] }) {
  const [filters, setFilters] = useState<any>({});
  const [globalFilterValue, setGlobalFilterValue] = useState("");

  /* ================= TRADUÇÃO DE STATUS ================= */
  const traduzirStatus = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DELIVERED":
        return "Entregue";
      case "READ":
        return "Lido";
      case "SENT":
        return "Enviado";
      case "QUEUED":
        return "Em fila";
      case "ERROR":
        return "Erro";
      default:
        return status || "-";
    }
  };

  const statusSeverity = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DELIVERED":
        return "success";
      case "READ":
        return "info";
      case "SENT":
        return "warning";
      case "QUEUED":
        return "secondary";
      case "ERROR":
        return "danger";
      default:
        return "secondary";
    }
  };

  const parsedData = useMemo(() => {
    return data.map((item) => {
      const responseLabel =
        item.response === true
          ? "Respondido"
          : item.response === false
          ? "Sem retorno"
          : "-";

      return {
        ...item,
        date_dispatch: item.date_dispatch ? new Date(item.date_dispatch) : null,
        status_label: traduzirStatus(item.status_sent),
        response_label: responseLabel,
      };
    });
  }, [data]);

  /* ================= FILTROS ================= */
  const initFilters = () => {
    setFilters({
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
    });

    setGlobalFilterValue("");
  };

  useEffect(() => {
    initFilters();
  }, []);

  const onGlobalFilterChange = (e: any) => {
    const value = e.target.value;

    setFilters((prev: any) => ({
      ...prev,
      global: { value, matchMode: FilterMatchMode.CONTAINS },
    }));

    setGlobalFilterValue(value);
  };

  /* ================= FILTRO DATA ================= */
  const dateFilterTemplate = (options: any) => (
    <Calendar
      value={options.value}
      onChange={(e) => options.filterCallback(e.value, options.index)}
      dateFormat="dd/mm/yy"
      showIcon
      mask="99/99/9999"
    />
  );

  /* ================= HEADER ================= */
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
            onChange={onGlobalFilterChange}
            placeholder="Busca global..."
            className="global-search-input p-inputtext"
          />
        </div>
      </div>
    </div>
  );

  /* ================= RENDER ================= */
  return (
    <div className="card">
      <DataTable
        value={parsedData}
        paginator
        rows={5}
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
        emptyMessage="Nenhum registro encontrado">

        <Column field="name" header="Cliente" filter />
        <Column field="number" header="Número" filter />

        <Column
          field="date_dispatch"
          header="Data/Hora"
          dataType="date"
          body={(row) =>
            row.date_dispatch ? row.date_dispatch.toLocaleString("pt-BR") : "-"
          }
          filter
          filterElement={dateFilterTemplate}
        />
        <Column
          header="Status"
          field="status_sent"        
          filterField="status_label"  
          body={(row) => (
            <Tag
              value={row.status_label}
              severity={statusSeverity(row.status_sent)}
            />
          )}
          filter
        />
        <Column
          header="Resposta"
          field="response"          
          filterField="response_label"   
          body={(row) => row.response_label}
          filter
        />
      </DataTable>
    </div>
  );
}
