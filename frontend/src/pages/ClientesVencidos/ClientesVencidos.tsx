import { useMemo, useState, type SetStateAction } from "react";
import { toast } from "react-toastify";
import { Funnel } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

/* =========================
   TIPOS E UTILITÃRIOS
========================= */
import type { Cliente, Template } from "../../types";
import { validarSelecaoCliente } from "../../utils/validation";
import { maiorAtrasoCliente } from "../../utils/filtrosClientesVencidos";
import type {Service} from "../../types/index"

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
import DynamicModal from "../../componente/modal/modalAlertTemplate";
import { TemplateBalloonCard } from "../../componente/TemplateCard/TemplateCard";

/* =========================
   HOOKS/CONTEXT
========================= */
import { useClient, useTemplate } from "../../hooks";
import { useDispatchTemplate } from "../../hooks/useDispatchTemplate";
import { useClientesVencidosSync } from "../../hooks/controller/clients/useClientesVencidosSync";


/* =========================
   STYLES
========================= */
import Style from "./Styles/ClientesVencidos.module.css";
import ModalCardCampanhas from "../../componente/ModalCardCampanhas/ModalCardCampanhas";
import { useFilterTemplates } from "../../hooks/components/useFilterTemplates.Controller";

/* =========================
   CONSTANTES
========================= */


export function ClientesVencidos() {
  // State para o campo de WhatsApp
  const [whatsappValue, setWhatsappValue] = useState("");

  /* =========================
     ESTADOS
  ========================= */
  const [varOpen, setVarOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"clientes" | null>(null);
  const [clientesMarcados, setClientesMarcados] = useState<string[]>([]);

  const [openProsseguirModal, setOpenProsseguirModal] = useState(false);
  // template modal
  const [openTemplateModal, setOpenTemplateModal] = useState(false);
  // campanha modal
  //const [openCampanhaModal, setOpenCampanhaModal] = useState(false);
  const [openConfirmTemplateModal, setOpenConfirmTemplateModal] = useState(false);

  const [templateSelecionado, setTemplateSelecionado] = useState<Template | null>(null);
  
  const [diasRegua, setDiasRegua] = useState(0);

  const [openCampanhaModal, setOpenCampanhaModal] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const [selectedPlans, setSelectedPlans] = useState<{ id: string; name: string; id_servico?: string }[]>([]);

  /* =========================
     CONTEXTOS
  ========================= */
  const {
    selectedClientes,
    setSelectedClientes,
    selectedTemplate,
    setSelectedTemplate,
    modoPage,
  } = useDispatchTemplate();
  const { paginatedTemplates, setModalPage, totalModalPages, itemsPerPage } = useFilterTemplates();
  const { clients, services = [], setQuery } = useClient();
  const { page, setPage, templates } = useTemplate();

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

  function handleProsseguir() {
    setOpenProsseguirModal(true);
  }

  const clientesFiltrados = useMemo(() => {
    if (diasRegua === 0) return [];

    let filtered = clients.filter((client) => {
      if (!client.invoices || client.invoices.list.length === 0) return false;

      const maiorAtraso = maiorAtrasoCliente(client.invoices.list);

      if (maiorAtraso <= 0) return false;

      return maiorAtraso >= diasRegua;
    });

    // Filtrar por planos selecionados
    if (selectedPlans.length > 0) {
      filtered = filtered.filter(client =>
        client.services && client.services.some(service =>
          selectedPlans.some(plan => plan.id === service.id)
        )
      );
    }

    return filtered;
  }, [clients, diasRegua, selectedPlans]);


  useClientesVencidosSync({
    diasRegua,
    clientesFiltrados,
    selectedClientes,
    clients,
    selectedPlans,
    setSelectedClientes,
  });

  /* =========================
     PAGINAÃ‡ÃƒO MODAL
  ========================= */


  return (
    <PageContainer className={Style.VencidosContainer}>
      <TitlePage 
      title="Clientes Vencidos" 
      subtitle="Filtre inadimplencia e avance para disparos ou campanhas" 
      
      />

      <div className={Style.contentPanel}>
        {/* ================= FILTROS ================= */}
        <div className={Style.filterPanel}>
          <div className={Style.filterLeft}>
            <div className={Style.ContainerForm}>
              <h2 className={Style.ContainerText}>
                <Funnel className={Style.IconFunil} /> Filtros
              </h2>

              <div className={Style.filtersGrid}>
                <RangeSlider
                  value={diasRegua}
                  onChange={(value: SetStateAction<number>) => setDiasRegua(value)}
                />

                <InputFields
                  className={Style.InputDividas}
                  type="number"
                  label="R$ Valor mínimo da dívida"
                />

                <Dropdown
                  className={Style.DropdownPlanos}
                  label="Planos por Clientes"
                  options={services.map((service: Service) => ({ id: service.id, name: service.name }))}
                  multiple
                  selected={selectedPlans}
                  open={varOpen}
                  onOpen={() => setVarOpen(true)}
                  onClose={() => setVarOpen(false)}
                  onChange={(selected) => {
                    setSelectedPlans(selected as { id: string; name: string }[]);
                  }}
                />

                {modoPage === "clientes" ? (
                  <Dropdown<Cliente>
                    className={Style.FiltroClientes}
                    label="Buscar clientes no ERP"
                    options={clients}
                    searchable
                    multiple
                    selected={selectedClientes}
                    onChange={(v) => {
                      const clientesValidos = (v as Cliente[]).filter(
                        (cliente) =>
                          validarSelecaoCliente(cliente, selectedTemplate!)
                      );
                      setSelectedClientes(clientesValidos);
                    }}
                    open={openDropdown === "clientes"}
                    onOpen={() => setOpenDropdown("clientes")}
                    onClose={() => setOpenDropdown(null)}
                    onSearchTermChange={(term) => setQuery(term)}
                  />
                ) : (
                  <InputFields
                    label="NÃºmero de Whatsapp"
                    onlyNumbers={true}
                    value={whatsappValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWhatsappValue(e.target.value)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ================= MÃ‰TRICAS ================= */}
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

        {/* ================= AÃ‡Ã•ES ================= */}
        <div className={Style.submenuActions}>
          <MyButton
            type="button"
            variant="btn-norm"
            text="Selecionar todos"
            onClick={marcarTodos}
          />

          <MyButton
            type="button"
            variant="btn-norm"
            text="Prosseguir"
            onClick={handleProsseguir}
          />
        </div>

        {/* ================= CARDS ================= */}
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

        {/* ================= MODAL OPÃ‡Ã•ES ================= */}
        {openProsseguirModal && (
          <DynamicModal
            open
            type="modaltemplates"
            title="Escolha uma opÃ§Ã£o:"
            description={
              <>
                VocÃª selecionou <b>{clientesMarcados.length}</b> clientes.
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
                  setOpenCampanhaModal(true); // <-- correto para abrir o modal de campanhas
                }
              },
              {
                label: "Criar campanha",
                variant: "BtnOpcoes",
                onClick: () => {
                  setOpenProsseguirModal(false);
                  navigate(`/CreateCampanha${location.search}`);
                },
              },
            ]}
          />
        )}

        <ModalCardCampanhas
          open={openCampanhaModal}
          onClose={() => setOpenCampanhaModal(false)}
          onConfirmCampaign={() =>
            toast.success("Campanha disparada com sucesso (Implementar)!")
          }
        />


        {/* ================= MODAL TEMPLATES ================= */}
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
                    onNext={() =>
                      setModalPage((p) => Math.min(p + 1, totalModalPages))
                    }
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


        {/* MODAL DE CONFIRMAÇÃO */}
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
                label: "Não",
                variant: "danger",
                onClick: () => setOpenConfirmTemplateModal(false),
              },
            ]}
          />
        )}
        {/* ================= PAGINAÃ‡ÃƒO PRINCIPAL ================= */}
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





