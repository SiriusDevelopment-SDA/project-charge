import { useRef, useState } from "react";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import { toast } from "react-toastify";
import Style from "../EfetuarDisparo/Styles/EfetuarDisparo.module.css";
import { useDispatchTemplate } from "../../hooks/useDispatchTemplate";
import type { Cliente, Template } from "../../types";
import { useClient, useTemplate } from "../../hooks";
import { processarDocumentos, validarSelecaoCliente } from "../../utils/validation";
import {
  PageContainer,
  BaseCard,
  Metricas,
  TitlePage,
  Dropdown,
  PreviewBox,
  UploadButton,
  DownloadModeloButton,
  InputFields,
  MyButton,
  DynamicModal,
} from "../../componente/Index";
import { handleUploadPlanilha } from "../../utils/hendleUploadSpreadSheat";
import {
  getStoredAttendantName,
  setStoredAttendantName,
  templateRequiresAttendantName,
} from "../../mappers/templateVars.mapper";

export default function EfetuarDisparo() {
  const [whatsappValue, setWhatsappValue] = useState("");
  const [openAttendantModal, setOpenAttendantModal] = useState(false);
  const [attendantName, setAttendantName] = useState(getStoredAttendantName());
  const [pendingExtraLeads, setPendingExtraLeads] = useState<Array<{ whatsapp: string }>>([]);
  const [openDropdown, setOpenDropdown] = useState<"template" | "clientes" | null>(null);
  const account = new URLSearchParams(window.location.search).get("account");
  const [openCategoryDropdown, setOpenCategoryDropdown] = useState<boolean>(false);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const categoryFilterRef = useRef<SVGSVGElement | null>(null);

  const { clients, setQuery, fetchInvoices } = useClient();
  const {
    setSearchTemplateName,
    searchTemplateName,
    categoryTemplateFilter,
    setCategoryTemplateFilter,
    filteredTemplates,
    categories,
  } = useTemplate();

  const {
    selectedClientes,
    setSelectedClientes,
    setSelectedTemplate,
    selectedTemplate,
    templateMapVars,
    sendTemplate,
    isSending,
    modoPage,
    setModoPage,
    selectedLeads,
    setSelectedLeads,
  } = useDispatchTemplate();

  const submitDispatch = async () => {
    let extraLeads: Array<{ whatsapp: string }> = [];

    if (modoPage === "leads" && whatsappValue.trim()) {
      const digits = whatsappValue.replace(/\D/g, "");
      if (digits.length < 12) {
        toast.warning("Numero de WhatsApp invalido. Use o padrao 55DDNUMERO.");
        return;
      }

      const exists = selectedLeads.some(
        (lead) => String(lead.whatsapp ?? "").replace(/\D/g, "") === digits,
      );
      if (!exists) {
        extraLeads = [{ whatsapp: digits }];
        setSelectedLeads((prev) => [...prev, { whatsapp: digits }]);
        setWhatsappValue("");
      }
    }

    const requiresAttendantName =
      selectedTemplate && templateRequiresAttendantName(selectedTemplate);
    const isEmbedMode = localStorage.getItem("auth_mode") === "embed";
    const hasAttendantName = getStoredAttendantName().length > 0;

    if (requiresAttendantName && isEmbedMode && !hasAttendantName) {
      setPendingExtraLeads(extraLeads);
      setOpenAttendantModal(true);
      return;
    }

    await sendTemplate(extraLeads);
  };

  return (
    <PageContainer className={Style.EfeturarDisparoContainer}>
      <TitlePage
        title={modoPage === "clientes" ? "Disparo clientes ativos" : "Disparo para leads"}
        subtitle={
          modoPage === "clientes"
            ? "Envie mensagens para clientes ativos com controle total"
            : "Envie mensagens diretas para leads com template validado"
        }
        className={Style.navTitlePage}
        setModoPage={setModoPage}
        text={modoPage === "clientes" ? "Disparo para leads" : "Disparo clientes ativos"}
      />

      <div
        className={Style.containerCenter}
        onClick={() => {
          setOpenDropdown(null);
          setOpenCategoryDropdown(false);
        }}
      >
        <div className={Style.containerCenterTop}>
          <div className={Style.containerInput} onClick={(e) => e.stopPropagation()}>
            <Dropdown<Template>
              label="Buscar template"
              options={filteredTemplates}
              value={selectedTemplate}
              onChange={(value) => setSelectedTemplate(value as Template)}
              open={openDropdown === "template"}
              onOpen={() => {
                setOpenDropdown("template");
                setOpenCategoryDropdown(false);
              }}
              onClose={() => {
                setOpenDropdown(null);
                setOpenCategoryDropdown(false);
              }}
              className={Style.dropdownTemplate}
            >
              {openDropdown === "template" && (
                <span className={Style.FilterDropdownTemplate}>
                  <InputFields
                    placeholder="Buscar template pelo nome"
                    value={searchTemplateName}
                    onChange={(event) => setSearchTemplateName(event.target.value)}
                  />

                  <div
                    className={Style.filterWrapper}
                    tabIndex={0}
                    onBlur={(event) => {
                      const nextTarget = event.relatedTarget as Node | null;
                      if (!nextTarget || !categoryMenuRef.current?.contains(nextTarget)) {
                        setOpenCategoryDropdown(false);
                      }
                    }}
                  >
                    <FilterAltOutlinedIcon
                      ref={categoryFilterRef}
                      className={`${Style.iconFilterDropdownTemplate} ${
                        categoryTemplateFilter ? Style.activeFilter : ""
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenCategoryDropdown((previous) => !previous);
                      }}
                    />

                    {openCategoryDropdown && (
                      <div ref={categoryMenuRef} className={Style.categoryMenu}>
                        <div
                          className={Style.categoryItem}
                          onClick={() => {
                            setCategoryTemplateFilter(null);
                            setOpenCategoryDropdown(false);
                          }}
                        >
                          Todas
                        </div>

                        {categories.map((category) => (
                          <div
                            key={category}
                            className={`${Style.categoryItem} ${
                              categoryTemplateFilter === category ? Style.categoryItemActive : ""
                            }`}
                            onClick={() => {
                              setCategoryTemplateFilter(category);
                              setOpenCategoryDropdown(false);
                            }}
                          >
                            {category}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </span>
              )}
            </Dropdown>


            {modoPage === "clientes" ? (
              <Dropdown<Cliente>
                label="Buscar clientes no ERP"
                options={clients}
                searchable
                multiple
                selected={selectedClientes}
                onChange={(value) => {
                  const novosClientes = value as Cliente[];
                  const clientesValidos = novosClientes.filter((cliente) => {
                    if (!selectedTemplate) return false;
                    return validarSelecaoCliente(cliente, selectedTemplate);
                  });

                  setSelectedClientes(clientesValidos);
                  if (selectedTemplate?.category === "Cobrança" && clientesValidos.length) {
                    void fetchInvoices(clientesValidos);
                  }
                }}
                open={openDropdown === "clientes"}
                onOpen={() => {
                  setOpenDropdown("clientes");
                  setOpenCategoryDropdown(false);
                }}
                onClose={() => {
                  setOpenDropdown(null);
                  setOpenCategoryDropdown(false);
                }}
                onSearchTermChange={(term) => setQuery(term)}
              />
            ) : (
              <InputFields
                label="Numero de Whatsapp"
                onlyNumbers={true}
                value={whatsappValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWhatsappValue(e.target.value)}
              />
            )}
          </div>

          <BaseCard classname={Style.cardMetricas}>
            <Metricas
              chave={modoPage === "clientes" ? "Clientes selecionados" : "Leads selecionados"}
              valor={
                modoPage === "clientes"
                  ? String(selectedClientes.length)
                  : String(selectedLeads.length)
              }
              classname={Style.contentMetricas}
              showIconBadge={false}
            />
          </BaseCard>
        </div>

        <div className={Style.containerButtonsPlanilha}>
          <UploadButton
            onUpload={(file) =>
              handleUploadPlanilha({
                file,
                clients,
                setQuery,
                account,
                setSelectedClientes,
                setSelectedLeads,
                processarDocumentos,
              })
            }
            disabled={modoPage === "leads" && !selectedTemplate}
          />
          <DownloadModeloButton templateSelecionado={selectedTemplate} modo={modoPage} />
        </div>

        <PreviewBox classname={Style.containerPreview}>
          {!selectedTemplate
            ? "Selecione um template"
            : templateMapVars?.[0]?.mensagem ?? selectedTemplate.message}
        </PreviewBox>
        <section className={Style.containerButtonSend}>
          <MyButton
            text={isSending ? "Enviando..." : "Enviar disparo"}
            variant="btn-enviar"
            className={Style.submitButton}
            disabled={isSending || !selectedTemplate}
            onClick={submitDispatch}
          />
        </section>
      </div>

      <DynamicModal
        open={openAttendantModal}
        type="custom"
        title="Informe o nome do atendente"
        onClose={() => setOpenAttendantModal(false)}
        customContent={
          <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            <p style={{ margin: 0 }}>
              Este template exige a variavel <strong>nome_atendente</strong>.
            </p>
            <InputFields
              label="Nome do atendente"
              value={attendantName}
              onChange={(event) => setAttendantName(event.target.value)}
            />
            <MyButton
              text="Confirmar e enviar"
              variant="btn-enviar"
              onClick={async () => {
                const normalized = attendantName.trim();
                if (!normalized) {
                  toast.warning("Informe o nome do atendente.");
                  return;
                }

                setStoredAttendantName(normalized);
                setOpenAttendantModal(false);
                await sendTemplate(pendingExtraLeads);
                setPendingExtraLeads([]);
              }}
            />
          </div>
        }
      />
    </PageContainer>
  );
}







