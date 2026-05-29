import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAccountParam } from "../../useAccountParam";
import { toast } from "react-toastify";
import type { DropdownType } from "../../../types";
import { useCampaign } from "../../useCampaign";
import { useClient } from "../../useCliente";
import { useTemplate } from "../../useTemplates";
import { useCampaignEditController } from "./useCampaignEditController";
import { useCampaignFormController } from "./useCampaignFormController";
import { handleUploadPlanilha } from "../../../utils/hendleUploadSpreadSheat";
import { processarDocumentos } from "../../../utils/validation";
import { templateRequiresAttendantName } from "../../../validators/template.validator";
import { AppStorage } from "../../../services/storage/storage.service";
import { useHolidays } from "../../useHolidays";
import { useNotificameChannels } from "../../useNotificameChannels";
import { filterBusinessDays, isWeekend, isHoliday } from "../../../utils/businessDay";
import { buildNormalizedSearch } from "../../../utils/locationSearch";

const INVOICE_RULE_LABELS = {
  greater_than: "Depois do vencimento",
  less_than: "Antes do vencimento",
  greater_or_equal: "Depois do vencimento",
  less_or_equal: "No dia do vencimento",
} as const;

function toCalendarDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthlyDispatchDateKeys(from: Date, to: Date, dayOfMonth: number): string[] {
  const dates: string[] = [];
  const fromNorm = new Date(from); fromNorm.setHours(12, 0, 0, 0);
  const toNorm = new Date(to); toNorm.setHours(12, 0, 0, 0);

  const cursor = new Date(fromNorm.getFullYear(), fromNorm.getMonth(), 1);

  while (cursor <= toNorm) {
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    if (dayOfMonth <= daysInMonth) {
      const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), dayOfMonth, 12, 0, 0);
      if (candidate >= fromNorm && candidate <= toNorm) {
        dates.push(toCalendarDateKey(candidate));
      }
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return dates;
}

function getCalendarDateKeysInRange(from: Date, to?: Date) {
  const endDate = to ?? from;
  const current = new Date(from);
  current.setHours(12, 0, 0, 0);

  const normalizedEnd = new Date(endDate);
  normalizedEnd.setHours(12, 0, 0, 0);

  const dates: string[] = [];

  while (current.getTime() <= normalizedEnd.getTime()) {
    dates.push(toCalendarDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function formatPreviewDate(value?: Date) {
  if (!value) return "--";
  return value.toLocaleDateString("pt-BR");
}

function formatInvoiceRulePreview(
  operator: keyof typeof INVOICE_RULE_LABELS,
  daysFrom: string,
  daysTo: string,
) {
  if (operator === "less_or_equal") {
    return "No dia do vencimento";
  }

  const numericFrom = Math.max(0, Number(daysFrom) || 0);
  const numericTo = Math.max(0, Number(daysTo) || 0);
  const start = Math.min(numericFrom, numericTo);
  const end = Math.max(numericFrom, numericTo);

  return `${INVOICE_RULE_LABELS[operator]} de ${start} a ${end} dia(s)`;
}

export function useCreateCampaignPageController() {
  const navigate = useNavigate();
  const location = useLocation();
  const normalizedSearch = buildNormalizedSearch(location.search);
  const [openDropdown, setOpenDropdown] = useState<DropdownType>(null);
  const [openAttendantModal, setOpenAttendantModal] = useState(false);
  const [attendantName, setAttendantName] = useState(AppStorage.getAttendantName());
  const [isConsultingInvoiceRule, setIsConsultingInvoiceRule] = useState(false);
  const holidays = useHolidays();

  const isNonBusinessDay = useCallback(
    (date: Date) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      if (d < today) return true;
      return isWeekend(date) || isHoliday(date, holidays);
    },
    [holidays],
  );

  const { clients, setQuery, consultClientsByInvoiceRule } = useClient();
  const {
    templates,
    filteredTemplates,
    categories: templateCategories,
    searchTemplateName,
    setSearchTemplateName,
    categoryTemplateFilter,
    setCategoryTemplateFilter,
  } = useTemplate();
  const { categories, reload } = useCampaign();
  const {
    channels,
    isLoading: isLoadingChannels,
    isEmpty: hasNoChannels,
  } = useNotificameChannels();
  const form = useCampaignFormController();
  const modal = useCampaignEditController();
  const account = useAccountParam();

  const isDateBlockedForMonthlyDays = useCallback(
    (date: Date) => {
      if (isNonBusinessDay(date)) return true;

      const dateKey = toCalendarDateKey(date);
      const isAlreadySelected = form.selectedDays.some(
        (s) => toCalendarDateKey(s) === dateKey,
      );
      if (isAlreadySelected) return false;

      const daysFrom = Math.max(Number(form.invoiceRuleDaysFrom) || 0, 0);
      const daysTo = Math.max(Number(form.invoiceRuleDaysTo) || 0, 0);
      const minInterval = Math.max(daysTo - daysFrom + 1, 1);

      return form.selectedDays.some((selected) => {
        const diffDays =
          Math.abs(date.getTime() - selected.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays < minInterval;
      });
    },
    [isNonBusinessDay, form.selectedDays, form.invoiceRuleDaysTo],
  );

  const toggleDropdown = useCallback((type: DropdownType) => {
    setOpenDropdown((prev) => (prev === type ? null : type));
  }, []);

  const closeDropdown = useCallback(() => setOpenDropdown(null), []);

  const previewStartDate =
    form.recurringType === "monthly_days"
      ? form.selectedDays[0]
      : form.dateRange?.from;

  const previewEndDate =
    form.recurringType === "monthly_days"
      ? form.selectedDays[form.selectedDays.length - 1] ?? form.selectedDays[0]
      : form.dateRange?.to ?? form.dateRange?.from;

  const previewDetails = useMemo(
    () => [
      
      { label: "Categoria", value: form.selectedCategory?.name ?? "--" },
      { label: "Inicio", value: formatPreviewDate(previewStartDate) },
      {
        label: "Fim",
        value: formatPreviewDate(previewEndDate),
      },
      { label: "Horario", value: form.dispatchTime || "--:--" },
      {
        label: "Recorrencia",
        value:
          form.recurringType === "single"
            ? "Unica"
            : form.recurringType === "range"
              ? "Recorrente"
              : "Dias do mes",
      },
      ...(form.recurringType !== "single"
        ? [
            {
              label: "Regua",
              value: formatInvoiceRulePreview(
                form.invoiceRuleOperator,
                form.invoiceRuleDaysFrom,
                form.invoiceRuleDaysTo,
              ),
            },
          ]
        : []),
      {
        label: "Time zone",
        value: Intl.DateTimeFormat().resolvedOptions().timeZone || "--",
      },
      { label: "Clientes", value: String(form.selectedClients.length) },
    ],
    [
      form.dispatchTime,
      form.invoiceRuleDaysFrom,
      form.invoiceRuleDaysTo,
      form.invoiceRuleOperator,
      form.recurringType,
      form.selectedCategory?.name,
      form.selectedClients.length,
      form.selectedDays,
      form.selectedTemplate?.name,
      previewEndDate,
      previewStartDate,
    ],
  );

  const handleBackToCampaigns = useCallback(() => {
    navigate(`/campanhas${normalizedSearch}`);
  }, [navigate, normalizedSearch]);

  const handleUploadClientsSpreadsheet = useCallback(
    (file: File) => {
      handleUploadPlanilha({
        file,
        clients,
        setQuery,
        account,
        setSelectedClientes: form.setSelectedClients,
        processarDocumentos,
      });
    },
    [account, clients, form.setSelectedClients, setQuery],
  );

  const handleConsultClientsByInvoiceRule = useCallback(async () => {
    if (form.recurringType === "single") {
      return;
    }

    const companyId =
      form.selectedTemplate?.company?.id ??
      templates?.[0]?.company?.id ??
      clients?.[0]?.company?.id;

    if (!companyId) {
      toast.warning("Nao foi possivel identificar a empresa. Tente novamente.");
      return;
    }

    const rawDaysFrom = Number(form.invoiceRuleDaysFrom);
    const rawDaysTo = Number(form.invoiceRuleDaysTo);
    const isSameDayRule = form.invoiceRuleOperator === "less_or_equal";
    const daysFrom = isSameDayRule ? 0 : rawDaysFrom;
    const daysTo = isSameDayRule ? 0 : rawDaysTo;

    if (
      !Number.isInteger(daysFrom) ||
      !Number.isInteger(daysTo) ||
      daysFrom < 0 ||
      daysTo < 0 ||
      daysFrom > daysTo
    ) {
      toast.warning("Informe um intervalo valido de dias para a regua de cobranca.");
      return;
    }

    const rawReferenceDates =
      form.recurringType === "monthly_days"
        ? form.selectedDays.map((date) => toCalendarDateKey(date))
        : form.dateRange?.from
          ? getCalendarDateKeysInRange(form.dateRange.from, form.dateRange.to)
          : [];

    const referenceDates = filterBusinessDays(rawReferenceDates, holidays);

    if (!referenceDates.length) {
      const hasRawDates = rawReferenceDates.length > 0;
      toast.warning(
        hasRawDates
          ? "Nenhum dia útil encontrado no período selecionado. O período contém apenas fins de semana e feriados."
          : "Selecione a data de disparo antes de consultar as faturas.",
      );
      return;
    }

    const filterPayload = {
      operator: form.invoiceRuleOperator,
      days: daysTo,
      daysFrom,
      daysTo,
      referenceDate: referenceDates[0],
      referenceDates,
      recurringType: form.recurringType,
    };

    setIsConsultingInvoiceRule(true);

    try {
      const result = await consultClientsByInvoiceRule({
        companyId: companyId!,
        filter: filterPayload,
      });

      console.log("[consultarFaturas] resultado:", result);
      console.log("[consultarFaturas] clientsByDispatchDate:", result.clientsByDispatchDate);

      form.setSelectedClientsFromInvoiceRule(result.clientsByDispatchDate);
    } finally {
      setIsConsultingInvoiceRule(false);
    }
  }, [
    clients,
    consultClientsByInvoiceRule,
    form,
    form.invoiceRuleDaysFrom,
    form.invoiceRuleDaysTo,
    form.invoiceRuleOperator,
    form.recurringType,
    form.selectedTemplate,
    holidays,
    templates,
  ]);

  const submitCampaign = useCallback(async () => {
    const result = await form.createCampaign();

    modal.closeModal();

    if (!result?.success) return;

    await reload();
    navigate(`/campanhas${normalizedSearch}`);
  }, [form, modal, navigate, normalizedSearch, reload]);

  const handleOpenPreview = useCallback(async () => {
    await form.handleSubmit(modal.openCreate, () => setOpenAttendantModal(true));
  }, [form, modal]);

  const handleConfirmPreview = useCallback(async () => {
    const requiresAttendant =
      form.selectedTemplate &&
      templateRequiresAttendantName(form.selectedTemplate);

    if (requiresAttendant && !AppStorage.getAttendantName()) {
      modal.closeModal();
      setOpenAttendantModal(true);
      return;
    }

    await submitCampaign();
  }, [form.selectedTemplate, modal, submitCampaign]);

  const handleCloseAttendantModal = useCallback(() => {
    setOpenAttendantModal(false);
  }, []);

  const handleConfirmAttendant = useCallback(async () => {
    const normalized = attendantName.trim();
    if (!normalized) {
      toast.warning("Informe o nome do atendente.");
      return;
    }

    AppStorage.setAttendantName(normalized);
    setOpenAttendantModal(false);
    await form.handleSubmit(modal.openCreate);
  }, [attendantName, form, modal]);

  return {
    account,
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
    previewMessage: String(
      form.templateMapVars?.[0]?.mensagem ??
        form.selectedTemplate?.message ??
        "Sem mensagem de template",
    ),
    searchTemplateName,
    setSearchTemplateName,
    categoryTemplateFilter,
    setCategoryTemplateFilter,
    setAttendantName,
    handleClientSearch: setQuery,
    toggleDropdown,
    closeDropdown,
    handleBackToCampaigns,
    handleUploadClientsSpreadsheet,
    handleConsultClientsByInvoiceRule,
    isConsultingInvoiceRule,
    invoiceRuleLabels: INVOICE_RULE_LABELS,
    handleOpenPreview,
    handleConfirmPreview,
    handleCloseAttendantModal,
    handleConfirmAttendant,
  };
}
