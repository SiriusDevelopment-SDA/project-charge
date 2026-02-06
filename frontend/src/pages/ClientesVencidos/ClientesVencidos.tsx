import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Funnel } from "lucide-react";

/* =========================
   TIPOS E UTILITÁRIOS
========================= */
import type { Cliente } from "../../types";
import { validarSelecaoCliente } from "../../utils/validation";

/* =========================
   COMPONENTES
========================= */
import { ClientesCard } from "../../componente/ClientesCard/ClientesCard";
import {
  BaseCard,
  Dropdown,
  Metricas,
  PageContainer,
  TitlePage,
  InputFields,
  MyButton,
} from "../../componente/Index";
import { Pagination } from "../../componente/global/Pagination/Pagination";
import RangeSlider from "../../componente/Slider/RangeSlider";

/* =========================
   HOOKS
========================= */
import { useClient, useTemplate } from "../../hooks";
import { useDispatchTemplate } from "../../hooks/useDispatchTemplate";

/* =========================
   STYLES
========================= */
import Style from "./Styles/ClientesVencidos.module.css";

export function ClientesVencidos() {
  /* =========================
     ESTADOS LOCAIS
  ========================= */
  const [varOpen, setVarOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"clientes" | null>(null);
  const [clientesMarcados, setClientesMarcados] = useState<string[]>([]);

  const [selectedVar] = useState<{
    id: string;
    name: string;
    category?: string;
  } | null>(null);

  /* =========================
     DADOS FIXOS
  ========================= */
  const varOptions = [
    { id: "1", name: "Plano 40MB" },
    { id: "2", name: "Plano 80MB" },
    { id: "3", name: "Plano 90MB" },
    { id: "4", name: "Plano 100MB" },
    { id: "5", name: "Plano 110MB" },
    { id: "6", name: "Plano 120MB" },
  ];

  /* =========================
     CONTEXTOS
  ========================= */
  const {
    selectedClientes,
    setSelectedClientes,
    selectedTemplate,
    modoPage,
  } = useDispatchTemplate();

  const { clients, setGroupInvoices } = useClient();
  const { page, setPage } = useTemplate();

  /* =========================
     EFFECT
  ========================= */
  useEffect(() => {
    setGroupInvoices(selectedClientes.length > 0);
  }, [selectedClientes, setGroupInvoices]);

  /* =========================
     AÇÕES
  ========================= */
  function toggleCliente(clienteId: string) {
    setClientesMarcados((prev) =>
      prev.includes(clienteId)
        ? prev.filter((id) => id !== clienteId)
        : [...prev, clienteId]
    );
  }

  function marcarTodos() {
    if (!selectedClientes.length) {
      toast.warning("Nenhum cliente para selecionar");
      return;
    }
    setClientesMarcados(selectedClientes.map((c) => c.id));
    toast.success("Todos os clientes foram selecionados!");
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <PageContainer className={Style.VencidosContainer}>
      <TitlePage title="Clientes Vencidos" />

      <div className={Style.contentPanel}>
        {/* =========================
           FILTROS + MÉTRICAS
        ========================= */}
        <div className={Style.filterPanel}>
          {/* FILTROS */}
          <div className={Style.filterLeft}>
            <div className={Style.ContainerForm}>
              <div className={Style.ContainerText}>
                <h2>
                  <Funnel className={Style.IconFunil} /> Filtros
                </h2>
              </div>

              <div className={Style.filtersGrid}>
                <RangeSlider/>

                <InputFields
                  className={Style.InputDividas}
                  type="number"
                  label="R$ Valor minimo da  Dívida"
                />

                <Dropdown
                  className={Style.DropdownPlanos}
                  label="Planos por Clientes"
                  options={varOptions}
                  value={selectedVar}
                  open={varOpen}
                  onOpen={() => setVarOpen(true)}
                  onClose={() => setVarOpen(false)}
                  onChange={() => []}
                />

                {modoPage === "clientes" ? (
                  <Dropdown<Cliente>
                    className={Style.FiltroClientes}
                    label="Buscar clientes no ERP"
                    options={clients}
                    multiple
                    selected={selectedClientes}
                    onChange={(v) => {
                      const novosClientes = v as Cliente[];

                      const clientesValidos = novosClientes.filter((cliente) =>
                        validarSelecaoCliente(cliente, selectedTemplate!)
                      );

                      setSelectedClientes([...clientesValidos]);
                    }}
                    open={openDropdown === "clientes"}
                    onOpen={() => setOpenDropdown("clientes")}
                    onClose={() => setOpenDropdown(null)}
                  />
                ) : (
                  <InputFields label="Whatsapp Number" />
                )}
              </div>
            </div>
          </div>

          {/* MÉTRICA */}
          <div className={Style.filterRight}>
            <BaseCard classname={Style.cardMetricas}>
              <Metricas
                chave={
                  modoPage === "clientes"
                    ? "Clientes Vencidos"
                    : "Leads selecionados"
                }
                valor={String(selectedClientes.length)}
                classname={Style.contentMetricas}
              />

            </BaseCard>
          </div>
        </div>

        {/* =========================
           AÇÕES
        ========================= */}
        <div className={Style.submenuActions}>
          <MyButton
            variant="btn-norm"
            text="Selecionar todos"
            onClick={marcarTodos}
          />
          <MyButton variant="btn-norm" text="Prosseguir" />
        </div>

        {/* =========================
           CARDS
        ========================= */}
        <div className={Style.Cards}>
          {!selectedClientes.length ? (
            <span className={Style.empty}>Nenhum cliente selecionado</span>
          ) : (
            selectedClientes.map((cliente) => (
              <ClientesCard
                key={cliente.id}
                cliente={cliente}
                checked={clientesMarcados.includes(cliente.id)}
                onToggle={() => toggleCliente(cliente.id)}
              />
            ))
          )}
        </div>

        {/* =========================
           MODAL DE 3 OPÇÕES
        ========================= */}
        <div className={Style.ModalOpcoes}>
          
        </div>

        {/* =========================
           PAGINAÇÃO
        ========================= */}
        <Pagination
          className={Style.Pagination}
          page={page}
          onPrev={() => setPage((p) => Math.max(p - 1, 1))}
          onNext={() => setPage((p) => p + 1)}
          disablePrev={page === 1}
        />
      </div>
    </PageContainer>
  );
}
