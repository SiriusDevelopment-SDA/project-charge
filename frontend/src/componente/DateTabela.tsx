"use client";

import { useEffect, useState } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { Tag } from "primereact/tag";
import { Calendar } from "primereact/calendar";
import { FilterMatchMode, FilterOperator } from "primereact/api";

/* ======================================================
   MOCK DE DADOS
====================================================== */
const MOCK_DISPAROS = [
  {
    id: 1,
    cliente: "João Silva",
    numero: "+55 11 99999-9999",
    campanha: "Cobrança Janeiro",
    dataHora: new Date("2025-01-05T14:32:00"),
    template: "Cobrança Amigável",
    status: "respondido",
    resposta: "Vou pagar hoje",
    valorCobrado: 9.08,
  },
  {
    id: 2,
    cliente: "Maria Souza",
    numero: "+55 21 98888-7777",
    campanha: "Aviso de Vencimento",
    dataHora: new Date("2025-01-05T10:12:00"),
    template: "Aviso Padrão",
    status: "enviado",
    resposta: "-",
    valorCobrado: 9.08,
  },
  {
    id: 3,
    cliente: "Carlos Pereira",
    numero: "+351 912 345 678",
    campanha: "Cobrança Final",
    dataHora: new Date("2025-01-04T18:45:00"),
    template: "Último Aviso",
    status: "erro",
    resposta: "Número inválido",
    valorCobrado: 0,
  },
  {
    id: 4,
    cliente: "Lucas Santos",
    numero: "+351 912 345 678",
    campanha: "Cobrança Final",
    dataHora: new Date("2025-01-04T18:45:00"),
    template: "Último Aviso",
    status: "erro",
    resposta: "Número inválido",
    valorCobrado: 200,
  },
  {
    id: 5,
    cliente: "Lucas Emanuel",
    numero: "+351 912 345 678",
    campanha: "Cobrança Final",
    dataHora: new Date("2025-01-04T18:45:00"),
    template: "Último Aviso",
    status: "erro",
    resposta: "Número inválido",
    valorCobrado: 300,
  },
  {
    id: 6,
    cliente: "Lucas Avanci",
    numero: "+351 912 345 678",
    campanha: "Cobrança Final",
    dataHora: new Date("2025-01-04T18:45:00"),
    template: "Último Aviso",
    status: "erro",
    resposta: "Número inválido",
    valorCobrado: 1000,
  },
  {
    id: 7,
    cliente: "Anderson Silva",
    numero: "+351 912 345 678",
    campanha: "Cobrança Final",
    dataHora: new Date("2025-01-04T18:45:00"),
    template: "Último Aviso",
    status: "erro",
    resposta: "Número inválido",
    valorCobrado: 1.50,
  },
  {
    id: 8,
    cliente: "Wellington Lima",
    numero: "+351 912 345 678",
    campanha: "Cobrança Final",
    dataHora: new Date("2025-01-04T18:45:00"),
    template: "Último Aviso",
    status: "erro",
    resposta: "Número inválido",
    valorCobrado: 0,
  },
  {
    id: 9,
    cliente: "Lorena Gomes",
    numero: "+351 912 345 678",
    campanha: "Cobrança Final",
    dataHora: new Date("2025-01-04T18:45:00"),
    template: "Último Aviso",
    status: "erro",
    resposta: "Número inválido",
    valorCobrado: 50000,
  },
  {
    id: 10,
    cliente: "Vitor Mendes",
    numero: "+351 912 345 678",
    campanha: "Cobrança Final",
    dataHora: new Date("2025-01-04T18:45:00"),
    template: "Último Aviso",
    status: "erro",
    resposta: "Número inválido",
    valorCobrado: 80,
  },
  {
    id: 11,
    cliente: "Vinicius Rocha",
    numero: "+351 912 345 678",
    campanha: "Cobrança Final",
    dataHora: new Date("2025-01-04T18:45:00"),
    template: "Último Aviso",
    status: "erro",
    resposta: "Número inválido",
    valorCobrado: 99,
  },
];

/* ======================================================
   HELPERS
====================================================== */
const statusSeverity = (status: string) => {
  switch (status) {
    case "respondido":
      return "success";
    case "enviado":
      return "info";
    case "erro":
      return "danger";
    default:
      return "secondary";
  }
};

/* ======================================================
   COMPONENTE
====================================================== */
export default function AdvancedFilterDemo() {
  const [disparos, setDisparos] = useState<any[]>([]);
  const [filters, setFilters] = useState<any>({});
  const [globalFilterValue, setGlobalFilterValue] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initFilters();
    setTimeout(() => {
      setDisparos(MOCK_DISPAROS);
      setLoading(false);
    }, 300);
  }, []);

  /* ======================================================
     FILTROS (OBRIGATÓRIO)
  ====================================================== */
  const initFilters = () => {
    setFilters({
      global: { value: null, matchMode: FilterMatchMode.CONTAINS },

      cliente: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
      },
      numero: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
      },
      campanha: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
      },
      template: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
      },
      status: {
        operator: FilterOperator.OR,
        constraints: [{ value: null, matchMode: FilterMatchMode.EQUALS }],
      },
      resposta: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
      },

      // ✅ FILTRO DE DATA (ESSENCIAL)
      dataHora: {
        operator: FilterOperator.AND,
        constraints: [
          { value: null, matchMode: FilterMatchMode.DATE_IS },
        ],
      },
    });

    setGlobalFilterValue("");
  };

  const onGlobalFilterChange = (e: any) => {
    const value = e.target.value;

    setFilters((prev: any) => ({
      ...prev,
      global: { value, matchMode: FilterMatchMode.CONTAINS },
    }));

    setGlobalFilterValue(value);
  };

  /* ======================================================
     TEMPLATE DO FILTRO DE DATA
  ====================================================== */
  const dateFilterTemplate = (options: any) => (
    <Calendar
      value={options.value}
      onChange={(e) => options.filterCallback(e.value, options.index)}
      dateFormat="dd/mm/yy"
      placeholder="Selecione a data"
      showIcon
      mask="99/99/9999"
    />
  );

  const header = (
    <div className="flex justify-content-between align-items-center">
      <Button
        icon="pi pi-filter-slash"
        label="Limpar filtros"
        outlined
        onClick={initFilters}
      />

      <IconField iconPosition="left">
        <InputIcon className="pi pi-search" />
        <InputText
          value={globalFilterValue}
          onChange={onGlobalFilterChange}
          placeholder="Busca global..."
        />
      </IconField>
    </div>
  );

  return (
    <div className="card">
      <DataTable
  value={disparos}
  loading={loading}
  paginator
  rows={10}
  dataKey="id"
  filters={filters}
  filterDisplay="menu"
  globalFilterFields={[
    "cliente",
    "numero",
    "campanha",
    "template",
    "status",
    "resposta",
  ]}
  header={header}
  showGridlines
  emptyMessage="Nenhum registro encontrado"
>
  <Column
    field="cliente"
    header="Cliente"
    filter
    bodyClassName="text-center"
    headerClassName="text-center"
  />

  <Column
    field="numero"
    header="Número"
    filter
    bodyClassName="text-center"
    headerClassName="text-center"
  />

  <Column
    field="campanha"
    header="Campanha"
    filter
    bodyClassName="text-center"
    headerClassName="text-center"
  />

  <Column
    field="dataHora"
    header="Data/Hora"
    dataType="date"
    body={(row) => row.dataHora.toLocaleString("pt-BR")}
    filter
    filterElement={dateFilterTemplate}
    bodyClassName="text-center"
    headerClassName="text-center"
  />

  <Column
    field="template"
    header="Template"
    filter
    bodyClassName="text-center"
    headerClassName="text-center"
  />

  <Column
    field="status"
    header="Status"
    body={(row) => (
      <Tag value={row.status} severity={statusSeverity(row.status)} />
    )}
    filter
    bodyClassName="text-center"
    headerClassName="text-center"
  />

  <Column
    field="resposta"
    header="Resposta"
    filter
    bodyClassName="text-center"
    headerClassName="text-center"
  />
</DataTable>

    </div>
  );
}
