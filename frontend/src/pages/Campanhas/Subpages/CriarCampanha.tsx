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

const INVOICE_RULE_MAX_DAYS = 360;

const INVOICE_RULE_PRESETS = [
  {
    id: "due_0_30",
    operator: "less_than" as const,
    daysFrom: 0,
    daysTo: 30,
    title: "0 - 30 dias",
    subtitle: "a vencer",
  },
  {
    id: "due_30_60",
    operator: "less_than" as const,
    daysFrom: 30,
    daysTo: 60,
    title: "30 - 60 dias",
    subtitle: "proximo mes",
  },
  {
    id: "due_30_90",
    operator: "less_than" as const,
    daysFrom: 30,
    daysTo: 90,
    title: "30 - 90 dias",
    subtitle: "medio prazo",
  },
  {
    id: "overdue_60_90",
    operator: "greater_than" as const,
    daysFrom: 60,
    daysTo: 90,
    title: "60 - 90 dias",
    subtitle: "vencido",
  },
  {
    id: "overdue_60_120",
    operator: "greater_than" as const,
    daysFrom: 60,
    daysTo: 120,
    title: "60 - 120 dias",
    subtitle: "atrasado",
  },
  {
    id: "overdue_90_180",
    operator: "greater_than" as const,
    daysFrom: 90,
    daysTo: 180,
    title: "90 - 180 dias",
    subtitle: "critico",
  },
] as const;

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
    handleOpenPreview,
    handleConfirmPreview,
    handleCloseAttendantModal,
    handleConfirmAttendant,
  } = useCreateCampaignPageController();

  const usesInvoiceRule = form.recurringType !== "single";
  const isMonthlyDays = form.recurringType === "monthly_days";
  const selectedDayLabels = form.selectedDays.map((date) => calendarDateFormatter.format(date));

  const getSliderPosition = (operator: InvoiceRuleOperator): number => {
    if (operator === 'greater_than' || operator === 'greater_or_equal') return 2;
    if (operator === 'less_or_equal') return 1;
    return 0;
  };
  const currentSlider = getSliderPosition(form.invoiceRuleOperator);
  const invoiceRuleDaysFrom = Math.max(0, Number(form.invoiceRuleDaysFrom) || 0);
  const invoiceRuleDaysTo = Math.max(0, Number(form.invoiceRuleDaysTo) || 0);
  const normalizedInvoiceRuleStart = Math.min(invoiceRuleDaysFrom, invoiceRuleDaysTo);
  const normalizedInvoiceRuleEnd = Math.max(invoiceRuleDaysFrom, invoiceRuleDaysTo);
  const rangeStartPercent = (normalizedInvoiceRuleStart / INVOICE_RULE_MAX_DAYS) * 100;
  const rangeEndPercent = (normalizedInvoiceRuleEnd / INVOICE_RULE_MAX_DAYS) * 100;
  const isSameDayRule = currentSlider === 1;
  const visibleInvoiceRulePresets = INVOICE_RULE_PRESETS.filter((preset) => {
    if (isSameDayRule) return false;
    return currentSlider === 0
      ? preset.operator === "less_than"
      : preset.operator === "greater_than";
  });

  const handleSliderPosition = (index: number) => {
    if (index === 0) {
      form.setInvoiceRuleOperator('less_than');
      if (normalizedInvoiceRuleStart === 0 && normalizedInvoiceRuleEnd === 0) {
        form.setInvoiceRuleDaysTo("30");
      }
      return;
    }

    if (index === 1) {
      form.setInvoiceRuleOperator('less_or_equal');
      form.setInvoiceRuleDaysFrom("0");
      form.setInvoiceRuleDaysTo("0");
      return;
    }

    form.setInvoiceRuleOperator('greater_than');
    if (normalizedInvoiceRuleStart === 0 && normalizedInvoiceRuleEnd === 0) {
      form.setInvoiceRuleDaysFrom("0");
      form.setInvoiceRuleDaysTo("30");
    }
  };

  const handleInvoiceRulePreset = (preset: typeof INVOICE_RULE_PRESETS[number]) => {
    form.setInvoiceRuleOperator(preset.operator);
    form.setInvoiceRuleDaysFrom(String(preset.daysFrom));
    form.setInvoiceRuleDaysTo(String(preset.daysTo));
  };

  const handleInvoiceRuleRangeStartChange = (value: number) => {
    const nextValue = Math.max(0, Math.min(value, normalizedInvoiceRuleEnd));
    form.setInvoiceRuleDaysFrom(String(nextValue));
  };

  const handleInvoiceRuleRangeEndChange = (value: number) => {
    const nextValue = Math.min(
      INVOICE_RULE_MAX_DAYS,
      Math.max(value, normalizedInvoiceRuleStart),
    );
    form.setInvoiceRuleDaysTo(String(nextValue));
  };

  const selectedClientNames = form.selectedClients
    .slice(0, 5)
    .map((client) => client.name)
    .join(", ");

  return (
    <PageContainer className={Style.createCampaign}>
      <div className={Style.createCampaign__header}>
        <TitlePage
          title="Criar Campanha"
          subtitle="Configure audiência, agendamento e mensagem da campanha"
        />
        <MyButton
          text="Voltar para campanhas"
          variant="secondary"
          onClick={handleBackToCampaigns}
        />
      </div>

      <div className={Style.createCampaign__form}>
        <h3>Dados da Campanha</h3>

        <div className={Style.createCampaign__grid}>
          <section className={Style.grid_left}>
            <span>Selecione uma data para efetuar o disparo</span>
            <div className={Style.createCampaign__calendar}>
              {isMonthlyDays ? (
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

            <section className={Style.timeContainer}>
              <div className={Style.createCampaign__scheduleTimeField}>
                    <span>Horario de disparo</span>
                    <InputFields
                      type="time"
                      value={form.dispatchTime}
                      onChange={(e) => form.setdispatchTime(e.target.value)}
                      required
                      />
              </div>
              {isMonthlyDays && (
                selectedDayLabels.length > 0 ? (
                 <div className={Style.containerDataSelect}>
                  <span className={Style.selectedDaysPreviewCount}>Data selecionada</span>
                  <div className={Style.selectedDaysPreview}>
                    
                    <div className={Style.selectedDaysPreviewHeader}>
                     
                      {selectedDayLabels.length > 6 && (
                        <small className={Style.selectedDaysPreviewHint}>Role para ver todas</small>
                      )}
                    </div>
                    <div className={Style.selectedDaysPreviewList}>
                      {selectedDayLabels.map((label) => (
                        <span key={label} className={Style.selectedDaysPreviewChip}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                 </div>
                ) : (
                  <div className={Style.selectedDaysPreviewEmpty}>
                    Clique nas datas em que deseja disparar
                  </div>
                )
              )}
            </section>

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
              

                 {usesInvoiceRule &&(
                   <div className={Style.invoiceRulePanel}>
                   <div className={Style.invoiceRuleHeader}>
                      <section className={Style.titleHeader}>
                        <small>
                         <span>Regua de cobranca</span>
                          {isMonthlyDays
                            ? "As datas escolhidas no calendário serão usadas como referência da regua ao consultar as faturas no ERP."
                            : "Cada dia dentro do período recorrente será usado como referência da regua ao consultar as faturas no ERP."}
                        </small>

                        <div className={Style.invoiceRuleTopRow}>
                          <div className={Style.invoiceRuleSlider}>
                            <div className={Style.invoiceRuleTrack}>
                              <div className={Style.invoiceRuleTrackLine} />
                              <div
                                className={Style.invoiceRuleThumb}
                                style={{ left: `${currentSlider * 50}%` }}
                              />
                              {[0, 1, 2].map((i) => (
                                <div
                                  key={i}
                                  className={Style.invoiceRuleTickDot}
                                  style={{ left: `${i * 50}%` }}
                                  onClick={() => handleSliderPosition(i)}
                                />
                              ))}
                            </div>
                            <div className={Style.invoiceRuleSliderLabels}>
                              {(['antes', 'no dia', 'depois'] as const).map((label, i) => (
                                <span
                                  key={label}
                                  className={currentSlider === i ? Style.sliderLabelActive : Style.sliderLabel}
                                  onClick={() => handleSliderPosition(i)}
                                >
                                {label}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* <div className={Style.invoiceRuleActionRow}>
                            <MyButton
                              text={isConsultingInvoiceRule ? "Consultando..." : "Consultar faturas"}
                              variant="secondary"
                              className={Style.invoiceRuleButton}
                              onClick={handleConsultClientsByInvoiceRule}
                              disabled={isConsultingInvoiceRule}
                            />
                          </div> */}
                        </div>
                      </section>
                    </div>
 
                   {visibleInvoiceRulePresets.length > 0 ? (
                     <div className={Style.invoiceRulePresets}>
                       {visibleInvoiceRulePresets.map((preset) => {
                         const isActive =
                           form.invoiceRuleOperator === preset.operator &&
                           normalizedInvoiceRuleStart === preset.daysFrom &&
                           normalizedInvoiceRuleEnd === preset.daysTo;

                         return (
                           <button
                             key={preset.id}
                             type="button"
                             className={`${Style.invoiceRulePresetCard} ${isActive ? Style.invoiceRulePresetCardActive : ""}`}
                             onClick={() => handleInvoiceRulePreset(preset)}
                           >
                             <strong>{preset.title}</strong>
                             <small>{preset.subtitle}</small>
                           </button>
                         );
                       })}
                     </div>
                   ) : (
                     <div className={Style.invoiceRulePresetHint}>
                       No dia do vencimento nao ha intervalos predefinidos.
                     </div>
                   )}

                   <div className={`${Style.invoiceRuleManualSection} ${isSameDayRule ? Style.invoiceRuleFieldDisabled : ""}`}>
                     <div className={Style.invoiceRuleManualHeader}>
                       <span>Ou defina manualmente</span>
                     </div>
                     {/* <div className={Style.invoiceRuleManualFields}>
                       <div className={Style.invoiceRuleField}>
                         <InputFields
                           label="De (dias)"
                           value={String(normalizedInvoiceRuleStart)}
                           onChange={(e) => handleInvoiceRuleRangeStartChange(Number(e.target.value || 0))}
                           onlyNumbers
                           disabled={isSameDayRule}
                         />
                       </div>
                       <div className={Style.invoiceRuleManualDivider}>-</div>
                       <div className={Style.invoiceRuleField}>
                         <InputFields
                           label="Ate (dias)"
                           value={String(normalizedInvoiceRuleEnd)}
                           onChange={(e) => handleInvoiceRuleRangeEndChange(Number(e.target.value || 0))}
                           onlyNumbers
                           disabled={isSameDayRule}
                         />
                       </div>
                     </div> */}

                     <div className={Style.invoiceRuleRangeSlider}>
                       <div className={Style.invoiceRuleRangeTrackBase} />
                       <div
                         className={Style.invoiceRuleRangeTrackActive}
                         style={{
                           left: `${rangeStartPercent}%`,
                           width: `${Math.max(rangeEndPercent - rangeStartPercent, 0)}%`,
                         }}
                       />
                       <input
                         type="range"
                         min={0}
                         max={INVOICE_RULE_MAX_DAYS}
                         step={1}
                         value={normalizedInvoiceRuleStart}
                         disabled={isSameDayRule}
                         className={Style.invoiceRuleRangeInput}
                         onChange={(e) => handleInvoiceRuleRangeStartChange(Number(e.target.value))}
                       />
                       <input
                         type="range"
                         min={0}
                         max={INVOICE_RULE_MAX_DAYS}
                         step={1}
                         value={normalizedInvoiceRuleEnd}
                         disabled={isSameDayRule}
                         className={Style.invoiceRuleRangeInput}
                         onChange={(e) => handleInvoiceRuleRangeEndChange(Number(e.target.value))}
                       />
                     </div>

                     <div className={Style.invoiceRuleRangeValues}>
                       <span>{normalizedInvoiceRuleStart} dias</span>
                       <span>{normalizedInvoiceRuleEnd} dias</span>
                     </div>

                     <div className={Style.invoiceRuleRangeScale}>
                       {[0, 90, 180, 270, 360].map((value) => (
                         <span key={value}>{value}</span>
                       ))}
                     </div>
                   </div>

                   <div className={Style.invoiceRuleSummary}>
                     {form.hasConsultedInvoiceRule
                       ? `${form.selectedClients.length} cliente(s) selecionado(s) automaticamente pela regua.`
                       : isSameDayRule
                         ? "A consulta vai carregar automaticamente os clientes com faturas no dia exato do vencimento."
                         : "A consulta vai carregar automaticamente os clientes com faturas dentro do intervalo informado."}
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
                {!usesInvoiceRule &&(
                  <BaseCard classname={Style.createCampaign__metricsCard}>
                  <Metricas
                    chave="Clientes selecionados"
                    valor={String(form.selectedClients?.length ?? 0)}
                    classname={Style.createCampaign__metricsContent}
                  />
                </BaseCard>
                )}
              </div>

             <div className={Style.containerBotton}>
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
                
                {!usesInvoiceRule && (
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
                summaryOnMultiple
                searchable
                onSearchTermChange={handleClientSearch}
              />
                )}
              </section>
              <section className={Style.campaignActionsRow}>
                <div className={Style.campaignNameField}>
                  <InputFields
                    label="Nome da Campanha"
                    value={form.name}
                    onChange={(e) => form.setName(e.target.value)}
                  />
                </div>
                <MyButton
                  text="Prosseguir"
                  variant="btn-enviar"
                  onClick={handleOpenPreview}
                  className={`${Style.btn_dispatch} ${Style.campaignActionButton}`}
                />
              </section>
             </div>
            </div>
        
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
