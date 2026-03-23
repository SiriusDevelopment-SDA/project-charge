import type { Category, Cliente, InvoiceRuleOperator, Template } from "../../../types";
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
  TitlePage,
  UploadButton,
} from "../../../componente/Index";
import { useCreateCampaignPageController } from "../../../hooks/controller/campaigns/useCreateCampaignPageController";
import Style from "../Styles/CriarCampanha.module.css";

const calendarDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const RECURRING_TYPE_LABELS = {
  single: "Unico",
  range: "Recorrente",
  monthly_days: "Dias do mes",
} as const;

export function CriarCampanha() {
  const {
    clients,
    templates,
    filteredTemplates,
    categories,
    templateCategories,
    form,
    modal,
    openDropdown,
    openAttendantModal,
    attendantName,
    previewDetails,
    previewMessage,
    searchTemplateName,
    setSearchTemplateName,
    categoryTemplateFilter,
    setCategoryTemplateFilter,
    setAttendantName,
    handleClientSearch,
    toggleDropdown,
    closeDropdown,
    handleBackToCampaigns,
    handleUploadClientsSpreadsheet,
    handleConsultClientsByInvoiceRule,
    isConsultingInvoiceRule,
    invoiceRuleLabels,
    handleOpenPreview,
    handleConfirmPreview,
    handleCloseAttendantModal,
    handleConfirmAttendant,
  } = useCreateCampaignPageController();

  const isRuleMode = form.recurringType === "monthly_days";
  const selectedDayLabels = form.selectedDays.map((date) => calendarDateFormatter.format(date));
  const selectedClientNames = form.selectedClients
    .slice(0, 5)
    .map((client) => client.name)
    .join(", ");

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

        {!isRuleMode && (
        <InputFields
          label="Nome da Campanha"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
        />
        )}

        <div className={Style.createCampaign__grid}>
          <section className={Style.grid_left}>
            <span>Selecione uma data para efetuar o disparo</span>
            <div className={Style.createCampaign__calendar}>
              {form.recurringType === "monthly_days" ? (
                <MyCalendar
                  mode="single"
                  selectedSingle={form.selectedDays[0]}
                  onSelectSingle={(date) => form.setSelectedDays(date ? [date] : [])}
                />
              ) : form.recurringType === "range" ? (
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

            {form.recurringType === "monthly_days" && (
              <div className={Style.selectedDaysPreview}>
                {selectedDayLabels.length > 0 ? (
                  <>Data selecionada: <span>{selectedDayLabels[0]}</span></>
                ) : (
                  "Clique na data em que deseja disparar"
                )}
              </div>
            )}

            {/* {!isRuleMode && (
              <>
                <DownloadModeloButton
                  templateSelecionado={form.selectedTemplate}
                  modo="clientes"
                  className={Style.btn_dawnload}
                />

                <UploadButton
                  onUpload={handleUploadClientsSpreadsheet}
                  className={Style.btn_upload}
                />
              </>
            )} */}
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

                 {isRuleMode &&(
                   <div className={Style.invoiceRulePanel}>
                    <div className={Style.invoiceRuleHeader}>
                      <span>Regua de cobranca</span>
                      <small>
                        A data escolhida no calendario sera usada como referencia da regua ao consultar as faturas no IXC.
                      </small>
                    </div>
 
                   <div className={Style.invoiceRuleRow}>
                     <label className={Style.invoiceRuleField}>
                       <span>Filtro</span>
                       <select
                         className={Style.invoiceRuleSelect}
                         value={form.invoiceRuleOperator}
                         onChange={(e) =>
                           form.setInvoiceRuleOperator(e.target.value as InvoiceRuleOperator)
                         }
                       >
                         {Object.entries(invoiceRuleLabels).map(([value, label]) => (
                           <option key={value} value={value}>
                             {label}
                           </option>
                         ))}
                       </select>
                     </label>
 
                     <div className={Style.invoiceRuleField}>
                       <InputFields
                         label="Quantidade de dias"
                         value={form.invoiceRuleDays}
                         onChange={(e) => form.setInvoiceRuleDays(e.target.value)}
                         onlyNumbers
                       />
                     </div>
 
                     <MyButton
                       text={isConsultingInvoiceRule ? "Consultando..." : "Consultar faturas"}
                       variant="secondary"
                       className={Style.invoiceRuleButton}
                       onClick={handleConsultClientsByInvoiceRule}
                       disabled={isConsultingInvoiceRule}
                     />
                   </div>
 
                   <div className={Style.invoiceRuleSummary}>
                     {form.hasConsultedInvoiceRule
                       ? `${form.selectedClients.length} cliente(s) selecionado(s) automaticamente pela regua.`
                       : "A consulta vai carregar automaticamente os clientes com faturas dentro da regra."}
                   </div>
 
                   {selectedClientNames && (
                     <div className={Style.invoiceRuleClientsPreview}>
                       Clientes encontrados: <span>{selectedClientNames}</span>
                       {form.selectedClients.length > 5
                         ? ` e mais ${form.selectedClients.length - 5}.`
                         : "."}
                     </div>
                   )}
                 </div>
                 )}
                
               
              </div>

              <div className={Style.recurringTypeSelector}>
                {(["single", "range", "monthly_days"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`${Style.recurringTypeBtn} ${form.recurringType === type ? Style.recurringTypeBtnActive : ""}`}
                    onClick={() => {
                      form.setRecurringType(type);
                      form.setDateRange(undefined);
                      form.setSelectedDays([]);
                      form.setSelectedClients([]);
                    }}
                  >
                    {RECURRING_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>

              <section className={Style.containerDropdown}>
                <Dropdown<Template>
                  label="Selecione um template"
                  options={filteredTemplates ?? templates ?? []}
                  value={form.selectedTemplate}
                  onChange={(value) => form.setSelectedTemplate(value as Template)}
                  open={openDropdown === "template"}
                  onOpen={() => toggleDropdown("template")}
                  onClose={closeDropdown}
                  searchValue={searchTemplateName}
                  searchPlaceholder="Buscar template pelo nome"
                  onSearchTermChange={setSearchTemplateName}
                  filterOptions={templateCategories}
                  filterValue={categoryTemplateFilter}
                  onFilterChange={setCategoryTemplateFilter}
                />

                <Dropdown<Category>
                  label="Selecione uma categoria"
                  options={categories ?? []}
                  value={form.selectedCategory}
                  onChange={(value) => form.setSelectedCategory(value as Category)}
                  open={openDropdown === "category"}
                  onOpen={() => toggleDropdown("category")}
                  onClose={closeDropdown}
                  searchable={false}
                />
              </section>
              
              {isRuleMode && (
                <section className={Style.containerDropdown}>
                   <InputFields
                    label="Nome da Campanha"
                    value={form.name}
                    onChange={(e) => form.setName(e.target.value)}
                  />
                  <MyButton
                    text="Prosseguir"
                    variant="btn-enviar"
                    onClick={handleOpenPreview}
                    className={Style.btn_dispatch}
                  />
                </section>
              )}
            </div>
            
            {!isRuleMode && (
              <Dropdown<Cliente>
                label="Selecionar Clientes"
                className={Style.createCampaign__selectedClientsDropdown}
                options={clients}
                selected={form.selectedClients}
                onChange={(value) => form.setSelectedClients(value as Cliente[])}
                open={openDropdown === "client"}
                onOpen={() => toggleDropdown("client")}
                onClose={closeDropdown}
                multiple
                searchable
                onSearchTermChange={handleClientSearch}
              />
            )}

           {!isRuleMode && (
             <MyButton
             text="Prosseguir"
             variant="btn-enviar"
             onClick={handleOpenPreview}
             className={Style.btn_dispatch}
            />
           )}
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
