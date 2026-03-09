import { useEffect, useState } from "react";
import type { Category, Cliente, DropdownType, Template } from "../../../types";
import Style from "../Styles/CriarCampanha.module.css";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  useCampaign,
  useCampaignEditController,
  useCampaignForm,
  useClient,
  useTemplate,
} from "../../../hooks";
import {
  BaseCard,
  Dropdown,
  InputFields,
  Metricas,
  MyButton,
  PageContainer,
  TitlePage,
  MyCalendar,
  SwitchLabels,
  DownloadModeloButton,
  DynamicModal,
  UploadButton,
} from "../../../componente/Index";
import { handleUploadPlanilha } from "../../../utils/hendleUploadSpreadSheat";
import { processarDocumentos } from "../../../utils/validation";
import {
  getStoredAttendantName,
  setStoredAttendantName,
  templateRequiresAttendantName,
} from "../../../mappers/templateVars.mapper";

export function CriarCampanha() {
  const navigate = useNavigate();
  const location = useLocation();
  const [openDropdown, setOpenDropdown] = useState<DropdownType>(null);
  const [openAttendantModal, setOpenAttendantModal] = useState(false);
  const [attendantName, setAttendantName] = useState(getStoredAttendantName());

  const { clients, setQuery } = useClient();
  const account = new URLSearchParams(location.search).get("account");
  const { templates } = useTemplate();
  const {
    createCampaign,
    isSubmitting,
    dateRange,
    setDateRange,
    name,
    setName,
    dispatchTime,
    setdispatchTime,
    selectedCategory,
    setSelectedCategory,
    selectedClients,
    setSelectedClients,
    recurring,
    setRecurring,
    handleSubmit,
    selectedTemplate,
    setSelectedTemplate,
  } = useCampaignForm();

  const { categories, reload } = useCampaign();

  const { ui, closeModal, openCreate } = useCampaignEditController();

  const toggleDropdown = (type: DropdownType) => {
    setOpenDropdown((prev) => (prev === type ? null : type));
  };
  const submitCampaign = async () => {
    const result = await createCampaign();
  
    closeModal(); // sempre fecha
  
    if (!result?.success) return;
  
    await reload();
    navigate(`/campanhas${location.search}`);
  };

  return (
    <PageContainer className={Style.createCampaign}>
      <div className={Style.createCampaign__header}>
        <TitlePage
          title="Criar Campanha"
          subtitle="Configure audiência, agendamento e mensagem da campanha"
        />
      </div>

      <div className={Style.createCampaign__form}>
        <h3>Dados da Campanha</h3>

        <InputFields
          label="Nome da Campanha"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className={Style.createCampaign__grid}>
          <section className={Style.grid_left}>
            <div className={Style.createCampaign__calendar}>
              {recurring ? (
                <MyCalendar mode="range" selected={dateRange} onSelect={setDateRange} />
              ) : (
                <MyCalendar
                  mode="single"
                  selectedSingle={dateRange?.from}
                  onSelectSingle={(date) =>
                    setDateRange(date ? { from: date, to: date } : undefined)
                  }
                />
              )}
            </div>

            <DownloadModeloButton
              templateSelecionado={selectedTemplate}
              modo={"clientes"}
              className={Style.btn_dawnload}
            />

            <UploadButton
              onUpload={(file) => {
                handleUploadPlanilha({
                  file,
                  clients,
                  setQuery,
                  account,
                  setSelectedClientes: setSelectedClients,
                  processarDocumentos,
                });
              }}
              className={Style.btn_upload}
            />
          </section>

          <section className={Style.grid_right}>
            <div className={Style.createCampaign__schedule}>
              <div className={Style.createCampaign__scheduleTime}>
                <div>
                  <span>Horário de disparo</span>
                  <InputFields
                    type="time"
                    value={dispatchTime}
                    onChange={(e) => setdispatchTime(e.target.value)}
                    required
                  />
                </div>

                <BaseCard classname={Style.createCampaign__metricsCard}>
                  <Metricas
                    chave={"Clientes selecionados"}
                    valor={String(selectedClients?.length ?? 0)}
                    classname={Style.createCampaign__metricsContent}
                  />
                </BaseCard>
              </div>

              <SwitchLabels
                checked={recurring}
                onChange={(value) => {
                  setRecurring(value);
                  setDateRange(undefined);
                }}
              />

              <Dropdown<Template>
                label="Selecione um template"
                options={templates ?? []}
                value={selectedTemplate}
                onChange={(value) => setSelectedTemplate(value as Template)}
                open={openDropdown === "template"}
                onOpen={() => toggleDropdown("template")}
                onClose={() => toggleDropdown(null)}
                searchable
              />

              <Dropdown<Category>
                label="Selecione uma categoria"
                options={categories ?? []}
                value={selectedCategory}
                onChange={(value) => setSelectedCategory(value as Category)}
                open={openDropdown === "category"}
                onOpen={() => toggleDropdown("category")}
                onClose={() => toggleDropdown(null)}
              />
            </div>

            <Dropdown<Cliente>
              label="Selecionar Clientes"
              className={Style.createCampaign__selectedClientsDropdown}
              options={clients}
              selected={selectedClients}
              onChange={(value) => setSelectedClients(value as Cliente[])}
              open={openDropdown === "client"}
              onOpen={() =>  toggleDropdown("client")}
              onClose={() => toggleDropdown(null)}
              multiple
              searchable
              onSearchTermChange={(term) => setQuery(term)}
            />

            <MyButton
              text="Prosseguir"
              variant="btn-enviar"
              onClick={() => handleSubmit(openCreate)}
              className={Style.btn_dispatch}
            />
          </section>
        </div>
      </div>

      {ui.activeModal === "CREATE" && (
        <DynamicModal
          open={ui.activeModal === "CREATE"}
          type="warning"
          title="Confirmação"
          description={<>Deseja realmente criar esta campanha?</>}
          onClose={closeModal}
          buttons={[
            {
              label: "Cancelar",
              variant: "danger",
              disabled: isSubmitting,
              onClick: closeModal,
            },
            {
              label: isSubmitting ? "Enviando..." : "Confirmar",
              variant: "success",
              disabled: isSubmitting,
              onClick: async () => {
                const requiresAttendantName =
                  selectedTemplate && templateRequiresAttendantName(selectedTemplate);
                const hasAttendantName = getStoredAttendantName().length > 0;

                if (requiresAttendantName && !hasAttendantName) {
                  closeModal();
                  setOpenAttendantModal(true);
                  return;
                }

                await submitCampaign();
              },
            },
          ]}
        />
      )}

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
              text={isSubmitting ? "Enviando..." : "Confirmar e criar campanha"}
              variant="btn-enviar"
              disabled={isSubmitting}
              onClick={async (e) => {
                e.stopPropagation()
                const normalized = attendantName.trim();
                if (!normalized) {
                  toast.warning("Informe o nome do atendente.");
                  return;
                }

                setStoredAttendantName(normalized);
                setOpenAttendantModal(false);
                await submitCampaign();
              }}
            />
          </div>
        }
      />
    </PageContainer>
  );
}
