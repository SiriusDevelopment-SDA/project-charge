import { useEffect, useMemo, useState, type SetStateAction } from "react";
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
import RangeSlider from "../../componente/Slider/RangeSlider";
import ModalCardCampanhas from "../../componente/ModalCardCampanhas/ModalCardCampanhas";
import DynamicModal from "../../componente/modal/modalAlertTemplate";
import { TemplateBalloonCard } from "../../componente/TemplateCard/TemplateCard";

import { useClient, useTemplate } from "../../hooks";
import { useDispatchTemplate } from "../../hooks/useDispatchTemplate";
import { useFilterTemplates } from "../../hooks/components/useFilterTemplates.Controller";

import { calcularDividaCliente, maiorAtrasoCliente } from "../../utils/filtrosClientesVencidos";
import { validarSelecaoCliente } from "../../utils/validation";
import type { Cliente, Service, Template } from "../../types";

import Style from "./Styles/ClientesVencidos.module.css";

const MIN_INPUT_PLACEHOLDER = "R$ Valor minimo da divida";

export function ClientesVencidos() {
  const navigate = useNavigate();
  const location = useLocation();

  const [varOpen, setVarOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"clientes" | null>(null);
  const [clientesMarcados, setClientesMarcados] = useState<string[]>([]);
  const [overrideClientes, setOverrideClientes] = useState<Cliente[]>([]);

  const [openProsseguirModal, setOpenProsseguirModal] = useState(false);
  const [openTemplateModal, setOpenTemplateModal] = useState(false);
  const [openConfirmTemplateModal, setOpenConfirmTemplateModal] = useState(false);
  const [openCampanhaModal, setOpenCampanhaModal] = useState(false);

  const [templateSelecionado, setTemplateSelecionado] = useState<Template | null>(null);
  const [diasRegua, setDiasRegua] = useState(0);
  const [valorMinimoDivida, setValorMinimaDivivda] = useState("");

  const [selectedPlans, setSelectedPlans] = useState<
    { id: string; name: string; id_servico?: string }[]
  >([]);

  const {
    selectedClientes,
    setSelectedClientes,
    selectedTemplate,
    setSelectedTemplate,
    modoPage,
  } = useDispatchTemplate();

  const { paginatedTemplates, setModalPage, totalModalPages, itemsPerPage, modalPage } =
    useFilterTemplates();

  const { clients, services = [], setGroupInvoices, setQuery } = useClient();
  const { page, setPage, templates } = useTemplate();

  useEffect(() => {
    setGroupInvoices(true);
  }, [setGroupInvoices]);

  const valorMinimoNumero = useMemo(() => {
    if (!valorMinimoDivida) return 0;
    const normalized = valorMinimoDivida.replace(",", ".");
    const numero = Number(normalized);
    return Number.isFinite(numero) ? numero : 0;
  }, [valorMinimoDivida]);

  const clientesFiltrados = useMemo(() => {
    let filtered = clients.filter((client) => {
      if (!client.invoices || client.invoices.list.length === 0) return false;

      const atraso = maiorAtrasoCliente(client.invoices.list);
      if (atraso <= 0) return false;

      if (diasRegua > 0 && atraso < diasRegua) return false;

      if (valorMinimoNumero > 0) {
        const divida = calcularDividaCliente(client.invoices.list);
        if (Math.round(divida * 100) < Math.round(valorMinimoNumero * 100)) return false;
      }

      return true;
    });

    if (selectedPlans.length > 0) {
      filtered = filtered.filter(
        (client) =>
          client.services &&
          client.services.some((service) => selectedPlans.some((plan) => plan.id === service.id))
      );
    }

    return filtered;
  }, [clients, diasRegua, selectedPlans, valorMinimoNumero]);

  const filtrosAtivos = diasRegua > 0 || valorMinimoNumero > 0 || selectedPlans.length > 0;

  const availableClientes =
    overrideClientes.length > 0 ? overrideClientes : filtrosAtivos ? clientesFiltrados : [];

  useEffect(() => {
    if (!filtrosAtivos) {
      setSelectedClientes([]);
      setClientesMarcados([]);
      setOverrideClientes([]);
    }

    if (filtrosAtivos && overrideClientes.length) {
      setOverrideClientes([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diasRegua, valorMinimoNumero, selectedPlans]);

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
                <RangeSlider
                  value={diasRegua}
                  onChange={(value: SetStateAction<number>) => {
                    setDiasRegua(value);
                  }}
                />

                <InputFields
                  className={Style.InputDividas}
                  type="text"
                  placeholder={MIN_INPUT_PLACEHOLDER}
                  value={valorMinimoDivida}
                  onChange={(event) => setValorMinimaDivivda(event.target.value)}
                />

                <Dropdown
                  className={Style.DropdownPlanos}
                  label="Planos por Clientes"
                  options={services.map((service: Service) => ({
                    id: service.id,
                    name: service.name,
                  }))}
                  multiple
                  selected={selectedPlans}
                  open={varOpen}
                  onOpen={() => setVarOpen(true)}
                  onClose={() => setVarOpen(false)}
                  onChange={(selected) => {
                    setSelectedPlans(selected as { id: string; name: string }[]);
                  }}
                />

                <Dropdown<Cliente>
                  className={Style.FiltroClientes}
                  label="Buscar clientes no ERP"
                  options={clients}
                  multiple
                  selected={selectedClientes}
                  summaryOnMultiple
                  onChange={(value) => {
                    const clientesValidos = (value as Cliente[]).filter((cliente) =>
                      validarSelecaoCliente(cliente, selectedTemplate ?? undefined)
                    );
                    setOverrideClientes(clientesValidos);
                    setSelectedClientes(clientesValidos);
                    setClientesMarcados(clientesValidos.map((c) => c.id));
                  }}
                  open={openDropdown === "clientes"}
                  onOpen={() => setOpenDropdown("clientes")}
                  onClose={() => setOpenDropdown(null)}
                  searchable
                  onSearchTermChange={(term) => setQuery(term)}
                />
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
            <span className={Style.empty}>Nenhum cliente selecionado</span>
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
                      className={Style.templateWrapper}
                      onClick={() => {
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
        />
      </div>
    </PageContainer>
  );
}
