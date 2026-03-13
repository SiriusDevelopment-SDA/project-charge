import type { Category, Cliente, Template } from "../../../types";
import {
  AttendantNameModalContent,
  BaseCard,
  DispatchPreviewContent,
  DownloadModeloButton,
  Dropdown,
  DynamicModal,
  InputFields,
  Metricas,
  MyButton,
  MyCalendar,
  PageContainer,
  SwitchLabels,
  TitlePage,
  UploadButton,
} from "../../../componente/Index";
import {
  useCreateCampaignPageController,
} from "../../../hooks/controller/campaigns/useCreateCampaignPageController";
import Style from "../Styles/CriarCampanha.module.css";

export function CriarCampanha() {
  const {
    clients,
    templates,
    categories,
    form,
    modal,
    openDropdown,
    openAttendantModal,
    attendantName,
    previewDetails,
    previewMessage,
    setAttendantName,
    handleClientSearch,
    toggleDropdown,
    handleBackToCampaigns,
    handleUploadClientsSpreadsheet,
    handleOpenPreview,
    handleConfirmPreview,
    handleCloseAttendantModal,
    handleConfirmAttendant,
  } = useCreateCampaignPageController();

  return (
    <PageContainer className={Style.createCampaign}>
      <div className={Style.createCampaign__header}>
        <TitlePage
          title="Criar Campanha"
          subtitle="Configure audiencia, agendamento e mensagem da campanha"
        />
        <MyButton
          text="Voltar para campanhas"
          variant="secondary"
          onClick={handleBackToCampaigns}
        />
      </div>

      <div className={Style.createCampaign__form}>
        <h3>Dados da Campanha</h3>

        <InputFields
          label="Nome da Campanha"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
        />

        <div className={Style.createCampaign__grid}>
          <section className={Style.grid_left}>
            <div className={Style.createCampaign__calendar}>
              {form.recurring ? (
                <MyCalendar
                  mode="range"
                  selected={form.dateRange}
                  onSelect={form.setDateRange}
                />
              ) : (
                <MyCalendar
                  mode="single"
                  selectedSingle={form.dateRange?.from}
                  onSelectSingle={(date) =>
                    form.setDateRange(date ? { from: date, to: date } : undefined)
                  }
                />
              )}
            </div>

            <DownloadModeloButton
              templateSelecionado={form.selectedTemplate}
              modo="clientes"
              className={Style.btn_dawnload}
            />

            <UploadButton
              onUpload={handleUploadClientsSpreadsheet}
              className={Style.btn_upload}
            />
          </section>

          <section className={Style.grid_right}>
            <div className={Style.createCampaign__schedule}>
              <div className={Style.createCampaign__scheduleTime}>
                <div>
                  <span>Horario de disparo</span>
                  <InputFields
                    type="time"
                    value={form.dispatchTime}
                    onChange={(e) => form.setdispatchTime(e.target.value)}
                    required
                  />
                </div>

                <BaseCard classname={Style.createCampaign__metricsCard}>
                  <Metricas
                    chave="Clientes selecionados"
                    valor={String(form.selectedClients?.length ?? 0)}
                    classname={Style.createCampaign__metricsContent}
                  />
                </BaseCard>
              </div>

              <SwitchLabels
                checked={form.recurring}
                onChange={(value) => {
                  form.setRecurring(value);
                  form.setDateRange(undefined);
                }}
              />

              <Dropdown<Template>
                label="Selecione um template"
                options={templates ?? []}
                value={form.selectedTemplate}
                onChange={(value) => form.setSelectedTemplate(value as Template)}
                open={openDropdown === "template"}
                onOpen={() => toggleDropdown("template")}
                onClose={() => toggleDropdown(null)}
                searchable
              />

              <Dropdown<Category>
                label="Selecione uma categoria"
                options={categories ?? []}
                value={form.selectedCategory}
                onChange={(value) => form.setSelectedCategory(value as Category)}
                open={openDropdown === "category"}
                onOpen={() => toggleDropdown("category")}
                onClose={() => toggleDropdown(null)}
              />
            </div>

            <Dropdown<Cliente>
              label="Selecionar Clientes"
              className={Style.createCampaign__selectedClientsDropdown}
              options={clients}
              selected={form.selectedClients}
              onChange={(value) => form.setSelectedClients(value as Cliente[])}
              open={openDropdown === "client"}
              onOpen={() => toggleDropdown("client")}
              onClose={() => toggleDropdown(null)}
              multiple
              searchable
              onSearchTermChange={handleClientSearch}
            />

            <MyButton
              text="Prosseguir"
              variant="btn-enviar"
              onClick={handleOpenPreview}
              className={Style.btn_dispatch}
            />
          </section>
        </div>
      </div>

      {modal.ui.activeModal === "CREATE" && (
        <DynamicModal
          open={modal.ui.activeModal === "CREATE"}
          type="custom"
          size="wide"
          title="Preview da campanha"
          onClose={modal.closeModal}
          customContent={
            <DispatchPreviewContent
              eyebrow="Campanha validada"
              headline={form.name.trim() || "Campanha pronta para criacao"}
              summary="Revise audiencia, template e janela de disparo antes de confirmar o agendamento."
              audienceLabel="Clientes na campanha"
              audienceCount={form.selectedClients.length}
              templateName={form.selectedTemplate?.name ?? "Template nao selecionado"}
              message={previewMessage}
              details={previewDetails}
              note="Ao confirmar, a campanha sera criada com as datas, horario e recorrencia definidos neste resumo."
              confirmLabel={form.isSubmitting ? "Criando..." : "Confirmar e criar campanha"}
              confirmDisabled={form.isSubmitting}
              onCancel={modal.closeModal}
              onConfirm={handleConfirmPreview}
            />
          }
        />
      )}

      <DynamicModal
        open={openAttendantModal}
        type="custom"
        title="Informe o nome do atendente"
        onClose={handleCloseAttendantModal}
        customContent={
          <AttendantNameModalContent
            value={attendantName}
            disabled={form.isSubmitting}
            onChange={setAttendantName}
            onConfirm={handleConfirmAttendant}
          />
        }
      />
    </PageContainer>
  );
}
