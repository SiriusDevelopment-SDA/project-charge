import type { Category, Cliente, InvoiceRuleOperator, Template } from "../../../types";
import {
  AttendantNameModalContent,
  BaseCard,
  ChannelSelect,
  DispatchPreviewContent,
  // DownloadModeloButton,
  Dropdown,
  DynamicModal,
  InputFields,
  Metricas,
  MyButton,
  MyCalendar,
  PageContainer,
  TitlePage,
  // UploadButton,
} from "../../../componente/Index";
import { useCreateCampaignPageController } from "../../../hooks/controller/campaigns/useCreateCampaignPageController";
import Style from "../Styles/CriarCampanha.module.css";
import { isTemplateApproved } from "../../../utils/templateStatus";

const calendarDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const calendarWeekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });

const RECURRING_TYPE_LABELS = {
  single: "Único",
  range: "Recorrente",
  monthly_days: "Dias do mês",
} as const;

const INVOICE_RULE_MAX_DAYS = 720;

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
    subtitle: "próximo mês",
  },
  {
    id: "due_30_90",
    operator: "less_than" as const,
    daysFrom: 30,
    daysTo: 90,
    title: "30 - 90 dias",
    subtitle: "médio prazo",
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
    subtitle: "crítico",
  },
] as const;

export function CriarCampanha() {
  const {
    clients,
    templates,
    filteredTemplates,
    categories,
    templateCategories,
    channels,
    isLoadingChannels,
    hasNoChannels,
    form,
    modal,
    openDropdown,
    openAttendantModal,
    attendantName,
    isNonBusinessDay,
    isDateBlockedForMonthlyDays,
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

  const sliderContextLabel =
    currentSlider === 1
      ? 'Disparo no mesmo dia que a fatura vence'
      : currentSlider === 0
        ? normalizedInvoiceRuleStart === normalizedInvoiceRuleEnd
          ? `Disparo ${normalizedInvoiceRuleEnd} dia${normalizedInvoiceRuleEnd !== 1 ? 's' : ''} antes da fatura vencer`
          : `Disparo entre ${normalizedInvoiceRuleStart} e ${normalizedInvoiceRuleEnd} dias antes da fatura vencer`
        : normalizedInvoiceRuleStart === normalizedInvoiceRuleEnd
          ? `Disparo ${normalizedInvoiceRuleEnd} dia${normalizedInvoiceRuleEnd !== 1 ? 's' : ''} após a fatura vencer`
          : `Disparo entre ${normalizedInvoiceRuleStart} e ${normalizedInvoiceRuleEnd} dias após a fatura vencer`;

  const formatInvoiceRuleRangeValue = (value: number) => {
    if (currentSlider === 1) {
      return "no dia do vencimento";
    }

    const suffix = currentSlider === 0 ? "a vencer" : "vencido";
    return `${value} dia${value !== 1 ? "s" : ""} ${suffix}`;
  };

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
    .slice(0, 3)
    .map((client) => client.name)
    .join(", ");

  return (
    <PageContainer className={Style.createCampaign}>
      {!usesInvoiceRule ? (
         <TitlePage
         title="Criar Campanha"
         subtitle="Configure audiência, agendamento e mensagem da campanha"
        >
        <MyButton
          text="Voltar para campanhas"
          variant="secondary"
          onClick={handleBackToCampaigns}
          />
        </TitlePage>
      ): (
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
      )}
     
      <div className={usesInvoiceRule ? Style.createCampaign__form : Style.createCampaign__form_dispatch_unique}>

        <div className={Style.createCampaign__grid}>
          <section className={Style.grid_left}>
            <span>Selecione uma data para efetuar o disparo</span>
            <div className={Style.createCampaign__calendar}>
              {isMonthlyDays ? (
                <MyCalendar
                  mode="multiple"
                  selectedMultiple={form.selectedDays}
                  onSelectMultiple={(dates) => form.setSelectedDays(dates ?? [])}
                  disabledDays={isDateBlockedForMonthlyDays}
                />
              ) : form.recurringType === "range" ? (
                <MyCalendar
                  mode="range"
                  selected={form.dateRange}
                  onSelect={form.setDateRange}
                  disabledDays={isNonBusinessDay}
                />
              ) : (
                <MyCalendar
                  mode="single"
                  selectedSingle={form.dateRange?.from}
                  onSelectSingle={(date) =>
                    form.setDateRange(date ? { from: date, to: date } : undefined)
                  }
                  disabledDays={isNonBusinessDay}
                />
              )}
            </div>

            {isMonthlyDays && (
              form.selectedDays.length > 0 ? (
                <div className={Style.dispatchDaysTableWrapper}>
                  <div className={Style.dispatchDaysTableHeader}>
                    <span className={Style.dispatchDaysTableTitle}>
                      {form.selectedDays.length} data{form.selectedDays.length > 1 ? "s" : ""} selecionada{form.selectedDays.length > 1 ? "s" : ""}
                    </span>
                    {Number(form.invoiceRuleDaysTo) > 0 && (
                      <span className={Style.dispatchDaysTableCount}>
                        intervalo mín: {Math.max(invoiceRuleDaysTo - invoiceRuleDaysFrom + 1, 1)} dias
                      </span>
                    )}
                  </div>
                  <div className={Style.dispatchDaysTableScroll}>
                    <table className={Style.dispatchDaysTable}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Data</th>
                          <th>Dia</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.selectedDays.map((date, i) => (
                          <tr key={date.getTime()}>
                            <td>{i + 1}</td>
                            <td className={Style.dispatchDaysTableDate}>{calendarDateFormatter.format(date)}</td>
                            <td className={Style.dispatchDaysTableWeekday}>{calendarWeekdayFormatter.format(date)}</td>
                            <td className={Style.dispatchDaysTableRemove}>
                              <button
                                type="button"
                                className={Style.dispatchDaysTableRemoveBtn}
                                onClick={() => form.setSelectedDays(form.selectedDays.filter((d) => d.getTime() !== date.getTime()))}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className={Style.selectedDaysPreviewEmpty}>
                  Clique nas datas em que deseja disparar
                </div>
              )
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


                {usesInvoiceRule && (
                  <div className={Style.invoiceRulePanel}>
                    <div className={Style.invoiceRuleHeader}>
                      <section className={Style.titleHeader}>
                        <small>
                          <span>Régua de cobrança</span>
                          {isMonthlyDays
                            ? "As datas escolhidas no calendário serão usadas como referência da régua sobre o snapshot de faturas sincronizado no sistema (sem consultar o ERP nesta etapa)."
                            : "Cada dia dentro do período recorrente será usado como referência da régua sobre o snapshot de faturas sincronizado no sistema (sem consultar o ERP nesta etapa)."}
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
                            <p className={Style.invoiceRuleSliderContext}>{sliderContextLabel}</p>
                          </div>

                        </div>
                      </section>
                    </div>

                    <div className={Style.invoiceRulePresets}>
                      {INVOICE_RULE_PRESETS.map((preset) => {
                        const isActive =
                          form.invoiceRuleOperator === preset.operator &&
                          normalizedInvoiceRuleStart === preset.daysFrom &&
                          normalizedInvoiceRuleEnd === preset.daysTo;
                        const isDisabled =
                          isSameDayRule ||
                          (currentSlider === 0 && preset.operator !== "less_than") ||
                          (currentSlider === 2 && preset.operator !== "greater_than");

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            disabled={isDisabled}
                            className={`${Style.invoiceRulePresetCard} ${isActive ? Style.invoiceRulePresetCardActive : ""} ${isDisabled ? Style.invoiceRulePresetCardDisabled : ""}`}
                            onClick={() => !isDisabled && handleInvoiceRulePreset(preset)}
                          >
                            <strong>{preset.title}</strong>
                            <small>{preset.subtitle}</small>
                          </button>
                        );
                      })}
                    </div>

                    <div className={`${Style.invoiceRuleManualSection} ${isSameDayRule ? Style.invoiceRuleFieldDisabled : ""}`}>
                      <div className={Style.invoiceRuleManualHeader}>
                        <span>Ou defina manualmente</span>
                      </div>

                      {!isSameDayRule && (
                        <>
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
                              className={Style.invoiceRuleRangeInput}
                              onChange={(e) => handleInvoiceRuleRangeStartChange(Number(e.target.value))}
                            />
                            <input
                              type="range"
                              min={0}
                              max={INVOICE_RULE_MAX_DAYS}
                              step={1}
                              value={normalizedInvoiceRuleEnd}
                              className={Style.invoiceRuleRangeInput}
                              onChange={(e) => handleInvoiceRuleRangeEndChange(Number(e.target.value))}
                            />
                          </div>

                          <div className={Style.invoiceRuleRangeValues}>
                            <span>{formatInvoiceRuleRangeValue(normalizedInvoiceRuleStart)}</span>
                            <span>{formatInvoiceRuleRangeValue(normalizedInvoiceRuleEnd)}</span>
                          </div>

                          <div className={Style.invoiceRuleRangeScale}>
                            {[0, 90, 180, 270, 360, 450, 540, 630, 720].map((value) => (
                              <span key={value}>{value}</span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div className={Style.invoiceRuleSummaryContainer}>
                      <div className={Style.invoiceRuleSummary}>
                        {form.hasConsultedInvoiceRule
                          ? `${form.selectedClients.length} cliente(s) selecionado(s) automaticamente pela régua.`
                          : isSameDayRule
                            ? "A consulta vai carregar automaticamente os clientes com faturas no dia exato do vencimento."
                            : "A consulta vai carregar automaticamente os clientes com faturas dentro do intervalo informado."}
                      </div>
                      <div className={Style.invoiceRuleActionRow}>
                        <MyButton
                          text={isConsultingInvoiceRule ? "Consultando..." : "Consultar faturas"}
                          variant="secondary"
                          className={Style.invoiceRuleButton}
                          onClick={handleConsultClientsByInvoiceRule}
                          disabled={isConsultingInvoiceRule}
                        />
                      </div>
                    </div>
                    {selectedClientNames && (
                      <div className={Style.invoiceRuleClientsPreview}>
                        Clientes encontrados: <span>{selectedClientNames}</span>
                        {form.selectedClients.length > 3
                          ? ` e mais ${form.selectedClients.length - 3}.`
                          : "."}
                      </div>
                    )}
                  </div>
                )}
                {!usesInvoiceRule && (
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
                    isOptionDisabled={(template) => !isTemplateApproved(template.meta_status)}
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
                  {/* So mostra o seletor quando ha mais de 1 canal — com 0 ou 1
                      nao ha o que escolher (o worker usa o unico canal). */}
                  {channels.length > 1 && (
                    <div className={Style.campaignChannelField}>
                      <ChannelSelect
                        value={form.channelId}
                        onChange={form.setChannelId}
                        channels={channels}
                        disabled={isLoadingChannels || hasNoChannels}
                        placeholder={
                          hasNoChannels
                            ? "Sem canais configurados"
                            : isLoadingChannels
                              ? "Carregando canais..."
                              : "Selecione o canal de disparo"
                        }
                      />
                    </div>
                  )}
                  <div className={Style.createCampaign__scheduleTimeField}>
                    <span>Horário de disparo</span>
                    <InputFields
                      type="time"
                      value={form.dispatchTime}
                      onChange={(e) => form.setdispatchTime(e.target.value)}
                      required
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
              headline={form.name.trim() || "Campanha pronta para criação"}
              summary="Revise audiência, template e janela de disparo antes de confirmar o agendamento."
              audienceLabel="Clientes na campanha"
              audienceCount={form.selectedClients.length}
              templateName={form.selectedTemplate?.name ?? "Template não selecionado"}
              message={previewMessage}
              details={previewDetails}
              note="Ao confirmar, a campanha será criada com as datas, horário e recorrência definidos neste resumo."
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
