import { useEffect, useMemo, useState } from "react";
import { Funnel } from "lucide-react";
import { toast } from "react-toastify";
import { useLocation, useNavigate } from "react-router-dom";

import { ClientesCard } from "../../componente/ClientesCard/ClientesCard";
import {
  BaseCard,
  Dropdown,
  InputFields,
  Metricas,
  MyButton,
  PageContainer,
  TitlePage,
} from "../../componente/Index";
import { Pagination } from "../../componente/global/Pagination/Pagination";
import ModalCardCampanhas from "../../componente/ModalCardCampanhas/ModalCardCampanhas";
import DynamicModal from "../../componente/modal/modalAlertTemplate";
import { TemplateBalloonCard } from "../../componente/TemplateCard/TemplateCard";

import { useClient, useTemplate } from "../../hooks";
import { useDispatchTemplate } from "../../hooks/useDispatchTemplate";
import { useFilterTemplates } from "../../hooks/components/useFilterTemplates.Controller";

import { calcularDiasRelativosHoje } from "../../utils/filtrosClientesVencidos";
import type { Cliente, Template } from "../../types";
import { getTemplateStatusLabel, isTemplateApproved } from "../../utils/templateStatus";

import Style from "./Styles/ClientesVencidos.module.css";

type DropdownOption = { id: string; name: string };
type TipoDiasOperador = "gt" | "lt" | "eq" | "gte" | "lte";

const TIPO_DIAS_OPTIONS: Array<{ id: TipoDiasOperador; name: string }> = [
  { id: "gt", name: "Maior que" },
  { id: "lt", name: "Menor que" },
  { id: "eq", name: "Igual" },
  { id: "gte", name: "Maior que ou igual a" },
  { id: "lte", name: "Menor que ou igual a" },
];

const STATUS_CONTRATO_OPTIONS: DropdownOption[] = [
  { id: "Inativo", name: "Inativo" },
  { id: "Novo", name: "Novo" },
  { id: "Ativo", name: "Ativo" },
  { id: "Suspenso", name: "Suspenso" },
  { id: "Cancelado", name: "Cancelado" },
  { id: "Ativo V. Reduzida", name: "Ativo V. Reduzida" },
  { id: "Inviabilidade Tecnica", name: "Inviabilidade Tecnica" },
];

function compararDias(valorCliente: number, valorFiltro: number, operador: TipoDiasOperador): boolean {
  const diasParaVencer = valorCliente > 0 ? valorCliente : null;
  const diasVencidos = valorCliente < 0 ? Math.abs(valorCliente) : null;

  switch (operador) {
    case "gt":
      return diasParaVencer !== null && diasParaVencer > valorFiltro;
    case "lt":
      return diasVencidos !== null && diasVencidos < valorFiltro;
    case "eq":
      return (
        diasParaVencer === valorFiltro ||
        diasVencidos === valorFiltro ||
        (valorCliente === 0 && valorFiltro === 0)
      );
    case "gte":
      return diasParaVencer !== null && diasParaVencer >= valorFiltro;
    case "lte":
      return diasVencidos !== null && diasVencidos <= valorFiltro;
    default:
      return true;
  }
}

export function ClientesVencidos() {
  const navigate = useNavigate();
  const location = useLocation();

  const [openDropdown, setOpenDropdown] = useState<"status" | "tipoDias" | null>(null);
  const [clientesMarcados, setClientesMarcados] = useState<string[]>([]);
  const [clientesResultadoConsulta, setClientesResultadoConsulta] = useState<Cliente[]>([]);
  const [consultaRealizada, setConsultaRealizada] = useState(false);
  const [consultando, setConsultando] = useState(false);

  const [openProsseguirModal, setOpenProsseguirModal] = useState(false);
  const [openTemplateModal, setOpenTemplateModal] = useState(false);
  const [openConfirmTemplateModal, setOpenConfirmTemplateModal] = useState(false);
  const [openCampanhaModal, setOpenCampanhaModal] = useState(false);

  const [templateSelecionado, setTemplateSelecionado] = useState<Template | null>(null);
  const [statusContrato, setStatusContrato] = useState<DropdownOption | null>(null);
  const [tipoDias, setTipoDias] = useState<{ id: TipoDiasOperador; name: string } | null>(null);
  const [dias, setDias] = useState("");

  const {
    selectedClientes,
    setSelectedClientes,
    setSelectedTemplate,
    modoPage,
  } = useDispatchTemplate();

  const { paginatedTemplates, setModalPage, totalModalPages, itemsPerPage, modalPage } =
    useFilterTemplates();

  const { clients, setGroupInvoices, setGroupServices, fetchInvoices } = useClient();
  const { page, setPage, templates, limit } = useTemplate();

  useEffect(() => {
    setGroupInvoices(true);
    setGroupServices(true);
  }, [setGroupInvoices, setGroupServices]);

  const diasNumero = useMemo(() => {
    if (!dias.trim()) return null;
    const numero = Number(dias);
    if (!Number.isFinite(numero) || numero < 0) return null;
    return numero;
  }, [dias]);

  const clientesFiltradosPorStatus = useMemo(() => {
    const filtered = clients.filter((client) => {
      if (statusContrato) {
        const hasMatchingStatus = Boolean(
          client.services?.some(
            (service) =>
              String(service.status ?? "").trim().toLowerCase() === statusContrato.id.toLowerCase()
          )
        );
        if (!hasMatchingStatus) return false;
      }

      return true;
    });

    return filtered;
  }, [clients, statusContrato]);

  function aplicarFiltroDias(clientesComFaturas: Cliente[]) {
    return clientesComFaturas.filter((client) => {
      if (!client.invoices || client.invoices.list.length === 0) return false;

      if (tipoDias && diasNumero !== null) {
        const possuiFaturaCompativel = client.invoices.list.some((invoice) => {
          if (!invoice.invoice_due_date) return false;
          const diasRelativos = calcularDiasRelativosHoje(invoice.invoice_due_date);
          return compararDias(diasRelativos, diasNumero, tipoDias.id);
        });

        if (!possuiFaturaCompativel) return false;
      }

      return true;
    });
  }

  const availableClientes = consultaRealizada ? clientesResultadoConsulta : [];

  useEffect(() => {
    if (selectedClientes.length === 0) return;
    const atualizados = selectedClientes.map((selectedClient) => {
      const clientAtualizado = clients.find((c) => c.id === selectedClient.id);
      return clientAtualizado || selectedClient;
    });
    setSelectedClientes(atualizados);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  function toggleCliente(cliente: Cliente) {
    setClientesMarcados((prev) =>
      prev.includes(cliente.id) ? prev.filter((id) => id !== cliente.id) : [...prev, cliente.id]
    );

    setSelectedClientes((prev) =>
      prev.some((c) => c.id === cliente.id)
        ? prev.filter((c) => c.id !== cliente.id)
        : [...prev, cliente]
    );
  }

  function marcarTodos() {
    if (!availableClientes.length) {
      toast.warning("Nenhum cliente para selecionar");
      return;
    }

    setClientesMarcados(availableClientes.map((c) => c.id));
    setSelectedClientes(availableClientes);
    toast.success("Todos os clientes foram selecionados!");
  }

  async function handleConsultar() {
    if (tipoDias && diasNumero === null) {
      toast.warning("Informe um valor valido para Dias.");
      return;
    }

    if (!tipoDias && dias.trim()) {
      toast.warning("Selecione o Tipo dias para aplicar o filtro.");
      return;
    }

    if (!clientesFiltradosPorStatus.length) {
      setClientesResultadoConsulta([]);
      setConsultaRealizada(true);
      setSelectedClientes([]);
      setClientesMarcados([]);
      toast.info("Nenhum cliente encontrado com os filtros informados.");
      return;
    }

    setConsultando(true);
    try {
      const clientesComFaturas = await fetchInvoices(clientesFiltradosPorStatus);
      const resultado = aplicarFiltroDias(clientesComFaturas);

      setClientesResultadoConsulta(resultado);
      setConsultaRealizada(true);
      setSelectedClientes([]);
      setClientesMarcados([]);

      if (!resultado.length) {
        toast.info("Nenhum cliente encontrado com os filtros informados.");
      }
    } finally {
      setConsultando(false);
    }
  }

  function handleLimparFiltros() {
    setStatusContrato(null);
    setTipoDias(null);
    setDias("");
    setOpenDropdown(null);
    setConsultaRealizada(false);
    setClientesResultadoConsulta([]);
    setClientesMarcados([]);
    setSelectedClientes([]);
  }

  function handleProsseguir() {
    setOpenProsseguirModal(true);
  }

  return (
    <PageContainer className={Style.VencidosContainer}>
      <TitlePage
        title="Clientes Vencidos"
        subtitle="Filtre inadimplencia e avance para disparos ou campanhas"
      />

      <div className={Style.contentPanel}>
        <div className={Style.filterPanel}>
          <div className={Style.filterLeft}>
            <div className={Style.ContainerForm}>
              <h2 className={Style.ContainerText}>
                <Funnel className={Style.IconFunil} /> Filtros
              </h2>

              <div className={Style.filtersGrid}>
                <Dropdown<DropdownOption>
                  className={Style.FiltroStatusContrato}
                  label="Status do contrato"
                  options={STATUS_CONTRATO_OPTIONS}
                  value={statusContrato}
                  onChange={(value) => setStatusContrato(value as DropdownOption)}
                  open={openDropdown === "status"}
                  onOpen={() => setOpenDropdown("status")}
                  onClose={() => setOpenDropdown(null)}
                  searchable={false}
                />

                <Dropdown<{ id: TipoDiasOperador; name: string }>
                  className={Style.FiltroTipoDias}
                  label="Tipo dias:*"
                  options={TIPO_DIAS_OPTIONS}
                  value={tipoDias}
                  onChange={(value) => setTipoDias(value as { id: TipoDiasOperador; name: string })}
                  open={openDropdown === "tipoDias"}
                  onOpen={() => setOpenDropdown("tipoDias")}
                  onClose={() => setOpenDropdown(null)}
                  searchable={false}
                />

                <InputFields
                  className={Style.InputDias}
                  type="text"
                  label="Dias:*"
                  onlyNumbers
                  value={dias}
                  onChange={(event) => setDias(event.target.value)}
                />

                <div className={Style.ConsultaActions}>
                  <MyButton
                    type="button"
                    variant="btn-norm"
                    text={consultando ? "Consultando..." : "Consultar"}
                    onClick={() => void handleConsultar()}
                    disabled={consultando}
                  />
                  <MyButton type="button" variant="secondary" text="Limpar filtros" onClick={handleLimparFiltros} />
                </div>
              </div>
            </div>
          </div>

          <div className={Style.filterRight}>
            <BaseCard className={Style.cardMetricas}>
              <Metricas
                chave={modoPage === "clientes" ? "Clientes Vencidos" : "Leads selecionados"}
                valor={String(availableClientes.length)}
                className={Style.contentMetricas}
              />
            </BaseCard>
          </div>
        </div>

        <div className={Style.submenuActions}>
          <MyButton type="button" variant="btn-norm" text="Selecionar todos" onClick={marcarTodos} />

          <MyButton type="button" variant="btn-norm" text="Prosseguir" onClick={handleProsseguir} />
        </div>

        <div className={Style.Cards}>
          {!availableClientes.length ? (
            <span className={Style.empty}>
              {consultaRealizada
                ? "Nenhum cliente encontrado"
                : "Use os filtros e clique em Consultar"}
            </span>
          ) : (
            availableClientes.map((cliente) => (
              <ClientesCard
                key={cliente.id}
                cliente={cliente}
                checked={clientesMarcados.includes(cliente.id)}
                onToggle={() => toggleCliente(cliente)}
              />
            ))
          )}
        </div>

        {openProsseguirModal && (
          <DynamicModal
            open
            type="modaltemplates"
            title="Escolha uma opcao:"
            description={
              <>
                Voce selecionou <b>{clientesMarcados.length}</b> clientes.
              </>
            }
            onClose={() => setOpenProsseguirModal(false)}
            buttons={[
              {
                label: "Fazer disparo ativo",
                variant: "BtnOpcoes",
                onClick: () => {
                  setOpenProsseguirModal(false);
                  setOpenTemplateModal(true);
                },
              },
              {
                label: "Selecionar uma campanha",
                variant: "BtnOpcoes",
                onClick: () => {
                  setOpenProsseguirModal(false);
                  setOpenCampanhaModal(true);
                },
              },
              {
                label: "Criar campanha",
                variant: "BtnOpcoes",
                onClick: () => {
                  setOpenProsseguirModal(false);
                  navigate(`/createCampanha${location.search}`);
                },
              },
            ]}
          />
        )}

        <ModalCardCampanhas
          open={openCampanhaModal}
          onClose={() => setOpenCampanhaModal(false)}
          onConfirmCampaign={() => toast.success("Campanha disparada com sucesso (Implementar)!")}
        />

        {openTemplateModal && (
          <DynamicModal
            open
            type="modaltemplates"
            title="SELECIONE O TEMPLATE"
            description={
              <div className={Style.modalTemplatesContent}>
                <div className={Style.listaTemplates}>
                  {paginatedTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={`${Style.templateWrapper} ${
                        !isTemplateApproved(template.meta_status)
                          ? Style.templateWrapperDisabled
                          : ""
                      }`}
                      onClick={() => {
                        if (!isTemplateApproved(template.meta_status)) {
                          toast.warning(
                            `O template ${template.name} ainda nao pode ser usado. Status atual: ${getTemplateStatusLabel(template.meta_status)}.`,
                          );
                          return;
                        }

                        setTemplateSelecionado(template);
                        setOpenConfirmTemplateModal(true);
                      }}
                    >
                      <TemplateBalloonCard
                        title={template.name}
                        message={template.message}
                        category={template.category}
                      />
                    </div>
                  ))}
                </div>

                {templates.length > itemsPerPage && (
                  <Pagination
                    className={Style.Pagination}
                    page={modalPage}
                    onPrev={() => setModalPage((p) => Math.max(p - 1, 1))}
                    onNext={() => setModalPage((p) => Math.min(p + 1, totalModalPages))}
                    disablePrev={modalPage === 1}
                    disableNext={modalPage === totalModalPages}
                  />
                )}
              </div>
            }
            onClose={() => setOpenTemplateModal(false)}
            buttons={[]}
          />
        )}

        {openConfirmTemplateModal && (
          <DynamicModal
            open
            type="warning"
            title="Confirmar template"
            description={
              <>
                Deseja utilizar este template para o disparo?
                <br />
                <strong>{templateSelecionado?.name}</strong>
              </>
            }
            onClose={() => setOpenConfirmTemplateModal(false)}
            buttons={[
              {
                label: "Sim",
                variant: "success",
                onClick: () => {
                  setSelectedTemplate(templateSelecionado);
                  setOpenConfirmTemplateModal(false);
                  setOpenTemplateModal(false);
                },
              },
              {
                label: "Nao",
                variant: "danger",
                onClick: () => setOpenConfirmTemplateModal(false),
              },
            ]}
          />
        )}

        <Pagination
          className={Style.Pagination}
          page={page}
          onPrev={() => setPage((p) => Math.max(p - 1, 1))}
          onNext={() => setPage((p) => p + 1)}
          disablePrev={page === 1}
          disableNext={templates.length < limit}
        />
      </div>
    </PageContainer>
  );
}
