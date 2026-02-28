import { useEffect, useMemo, useState, type SetStateAction } from "react";
import { toast } from "react-toastify";
import { Funnel } from "lucide-react";
import { useNavigate } from "react-router-dom";

/* =========================
   TIPOS E UTILITÁRIOS
========================= */
import type { Cliente } from "../../types";
import { validarSelecaoCliente } from "../../utils/validation";
import { maiorAtrasoCliente, calcularDividaCliente } from "../../utils/filtrosClientesVencidos";
import type { Service } from "../../types/index"

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


/* =========================
   STYLES
========================= */
import Style from "./Styles/ClientesVencidos.module.css";
import ModalCardCampanhas from "../../componente/ModalCardCampanhas/ModalCardCampanhas";

/* =========================
   CONSTANTES
========================= */
const ITEMS_PER_PAGE = 8;

export function ClientesVencidos() {
  // State para o campo de WhatsApp
  const [whatsappValue, setWhatsappValue] = useState("");

  /* =========================
     ESTADOS
  ========================= */
  const [varOpen, setVarOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"clientes" | null>(null);
  const [clientesMarcados, setClientesMarcados] = useState<string[]>([]);
  // se o usuário usar o dropdown para buscar clientes, armazenamos aqui
  const [overrideClientes, setOverrideClientes] = useState<Cliente[]>([]);

  const [openProsseguirModal, setOpenProsseguirModal] = useState(false);
  // template modal
  const [openTemplateModal, setOpenTemplateModal] = useState(false);
  // campanha modal
  //const [openCampanhaModal, setOpenCampanhaModal] = useState(false);
  const [openConfirmTemplateModal, setOpenConfirmTemplateModal] = useState(false);

  const [templateSelecionado, setTemplateSelecionado] = useState<any | null>(null);
  const [modalPage, setModalPage] = useState(1);
  const [diasRegua, setDiasRegua] = useState(0);
  const [valorMinimoDivida, setValorMinimaDivivda] = useState("");

  const [openCampanhaModal, setOpenCampanhaModal] = useState(false);

  const navigate = useNavigate();

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

  const { clients, services, setGroupInvoices } = useClient();
  const { page, setPage, templates } = useTemplate();

  function toggleCliente(cliente: Cliente) {
    setClientesMarcados((prev) =>
      prev.includes(cliente.id)
        ? prev.filter((id) => id !== cliente.id)
        : [...prev, cliente.id]
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

  const valorMinimoNumero = useMemo(() => {

    if (!valorMinimoDivida) return 0;

    const normalized = valorMinimoDivida.replace(',', '.');

    const n = Number(normalized);

    console.log("INPUT:", valorMinimoDivida);
    console.log("NORMALIZED:", normalized);
    console.log("NUMERO FINAL:", n);

    return Number.isFinite(n) ? n : 0;

  }, [valorMinimoDivida]);

  const clientesFiltrados = useMemo(() => {

    console.log("VALOR MINIMO NO FILTRO:", valorMinimoNumero);

    let filtered = clients.filter((client) => {

      if (!client.invoices || client.invoices.list.length === 0)
        return false;

      const maiorAtraso = maiorAtrasoCliente(client.invoices.list);

      if (maiorAtraso <= 0)
        return false;

      /* ✅ RÉGUA DE COBRANÇA (CORRETA) */
      if (diasRegua > 0 && maiorAtraso < diasRegua)
        return false;

      /* ✅ VALOR MÍNIMO DA DÍVIDA */
      if (valorMinimoNumero > 0) {

        const divida = calcularDividaCliente(client.invoices.list);

        console.log("DIVIDA CLIENTE:", client.name, divida);

        if (Math.round(divida * 100) < Math.round(valorMinimoNumero * 100))
          return false;
      }

      return true;
    });

    /* ✅ FILTRO DE PLANOS (INALTERADO) */
    if (selectedPlans.length > 0) {

      filtered = filtered.filter(client =>
        client.services &&
        client.services.some(service =>
          selectedPlans.some(plan => plan.id === service.id)
        )
      );
    }

    return filtered;

  }, [clients, diasRegua, selectedPlans, valorMinimoNumero]);

  // lista efetivamente exibida no painel: primeiro vem override (busca manual), caso contrário os resultados do filtro
  // se houver override manual, usamos ele; senão, mostramos os filtrados
  // porém, quando nenhum filtro está ativo queremos lista vazia para evitar
  // preencher automaticamente ao carregar a página ou limpar os filtros.
  const filtrosAtivos =
    diasRegua > 0 ||
    valorMinimoNumero > 0 ||
    selectedPlans.length > 0;

  const availableClientes = overrideClientes.length > 0
    ? overrideClientes
    : filtrosAtivos
    ? clientesFiltrados
    : [];


  // limpa seleção de clientes quando todos os filtros forem removidos
  useEffect(() => {
    const filtrosAtivos =
      diasRegua > 0 ||
      valorMinimoNumero > 0 ||
      selectedPlans.length > 0;

    if (!filtrosAtivos) {
      setSelectedClientes([]);
      setClientesMarcados([]);
      setOverrideClientes([]);
    }
    // quando qualquer filtro ativo muda, abandonamos resultados do dropdown manual
    if (filtrosAtivos && overrideClientes.length) {
      setOverrideClientes([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diasRegua, valorMinimoNumero, selectedPlans]);

  useEffect(() => {
    // Atualiza selectedClientes quando clients recebe as invoices
    if (selectedClientes.length > 0) {
      const clientesAtualizados = selectedClientes.map(selectedClient => {
        const clientAtualizado = clients.find(c => c.id === selectedClient.id);
        return clientAtualizado || selectedClient;
      });
      setSelectedClientes(clientesAtualizados);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  useEffect(() => {
    setGroupInvoices(true);
  }, []);

  /* =========================
     PAGINAÇÃO MODAL
  ========================= */
  const totalModalPages = Math.max(
    1,
    Math.ceil(templates.length / ITEMS_PER_PAGE)
  );

  const paginatedTemplates = useMemo(() => {
    return templates.slice(
      (modalPage - 1) * ITEMS_PER_PAGE,
      modalPage * ITEMS_PER_PAGE
    );
  }, [templates, modalPage]);

  return (
    <PageContainer className={Style.VencidosContainer}>
      <TitlePage title="Clientes Vencidos" />

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
                  onChange={(value: SetStateAction<number>) => {
                    setDiasRegua(value);
                  }}
                />

                <InputFields
                  className={Style.InputDividas}
                  type="text"
                  placeholder="R$ Valor mínimo da Dívida"
                  value={valorMinimoDivida}
                  onChange={(e) => {
                    setValorMinimaDivivda(e.target.value);
                  }}
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
                    console.log('Selected plans:', selected);
                  }}
                />

                {modoPage === "clientes" ? (
                  <Dropdown<Cliente>
                    className={Style.FiltroClientes}
                    label="Buscar clientes no ERP"
                    options={clients}
                    multiple
                    selected={selectedClientes}
                    onChange={(v) => {
                      const clientesValidos = (v as Cliente[]).filter(
                        (cliente) =>
                          validarSelecaoCliente(cliente, selectedTemplate!)
                      );
                      // dropdown manual substitui os resultados do filtro
                      setOverrideClientes(clientesValidos);
                      setSelectedClientes(clientesValidos);
                      setClientesMarcados(clientesValidos.map((c) => c.id));
                    }}
                    open={openDropdown === "clientes"}
                    onOpen={() => setOpenDropdown("clientes")}
                    onClose={() => setOpenDropdown(null)}
                  />
                ) : (
                  <InputFields
                    label="Número de Whatsapp"
                    onlyNumbers={true}
                    value={whatsappValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWhatsappValue(e.target.value)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ================= MÉTRICAS ================= */}
          <div className={Style.filterRight}>
            <BaseCard className={Style.cardMetricas}>
              <Metricas
                chave={
                  modoPage === "clientes"
                    ? "Clientes Vencidos"
                    : "Leads selecionados"
                }
                valor={String(availableClientes.length)}
                className={Style.contentMetricas}
              />
            </BaseCard>
          </div>
        </div>

        {/* ================= AÇÕES ================= */}
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

        {/* ================= MODAL OPÇÕES ================= */}
        {openProsseguirModal && (
          <DynamicModal
            open
            type="modaltemplates"
            title="Escolha uma opção:"
            description={
              <>
                Você selecionou <b>{clientesMarcados.length}</b> clientes.
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
                  navigate("/CreateCampanha");
                },
              },
            ]}
          />
        )}

        <ModalCardCampanhas
          open={openCampanhaModal}
          onClose={() => setOpenCampanhaModal(false)}
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

                {templates.length > ITEMS_PER_PAGE && (
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
        {/* ================= PAGINAÇÃO PRINCIPAL ================= */}
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
