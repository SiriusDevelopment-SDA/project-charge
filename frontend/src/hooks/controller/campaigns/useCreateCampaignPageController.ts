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

const INVOICE_RULE_LABELS = {
  greater_than: "Maior que",
  less_than: "Menor que",
  greater_or_equal: "Maior ou igual a",
  less_or_equal: "Menor ou igual a",
} as const;

function toCalendarDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPreviewDate(value?: Date) {
  if (!value) return "--";
  return value.toLocaleDateString("pt-BR");
}

export function useCreateCampaignPageController() {
  const navigate = useNavigate();
  const location = useLocation();
  const [openDropdown, setOpenDropdown] = useState<DropdownType>(null);
  const [openAttendantModal, setOpenAttendantModal] = useState(false);
  const [attendantName, setAttendantName] = useState(AppStorage.getAttendantName());
  const [isConsultingInvoiceRule, setIsConsultingInvoiceRule] = useState(false);

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
  const form = useCampaignFormController();
  const modal = useCampaignEditController();
  const account = useAccountParam();

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
      { label: "Template", value: form.selectedTemplate?.name ?? "--" },
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
      ...(form.recurringType === "monthly_days"
        ? [
            {
              label: "Regua",
              value: `${INVOICE_RULE_LABELS[form.invoiceRuleOperator]} ${form.invoiceRuleDays} dia(s)`,
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
      form.invoiceRuleDays,
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
    navigate(`/campanhas${location.search}`);
  }, [location.search, navigate]);

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
    if (form.recurringType !== "monthly_days") {
      return;
    }

    const selectedDispatchDate = form.selectedDays[0];
    if (!selectedDispatchDate) {
      toast.warning("Selecione a data de disparo antes de consultar as faturas.");
      return;
    }

    if (!form.selectedTemplate?.company?.id) {
      toast.warning("Selecione um template antes de consultar as faturas.");
      return;
    }

    const days = Number(form.invoiceRuleDays);
    if (!Number.isInteger(days) || days < 1) {
      toast.warning("Informe uma quantidade de dias valida para a regua de cobranca.");
      return;
    }

    setIsConsultingInvoiceRule(true);

    try {
      const clientsFromRule = await consultClientsByInvoiceRule({
        companyId: form.selectedTemplate.company.id,
        filter: {
          operator: form.invoiceRuleOperator,
          days,
          referenceDate: toCalendarDateKey(selectedDispatchDate),
        },
      });

      form.setSelectedClientsFromInvoiceRule(clientsFromRule);
    } finally {
      setIsConsultingInvoiceRule(false);
    }
  }, [
    consultClientsByInvoiceRule,
    form,
    form.invoiceRuleDays,
    form.invoiceRuleOperator,
    form.recurringType,
    form.selectedTemplate,
  ]);

  const submitCampaign = useCallback(async () => {
    const result = await form.createCampaign();

    modal.closeModal();

    if (!result?.success) return;

    await reload();
    navigate(`/campanhas${location.search}`);
  }, [form, location.search, modal, navigate, reload]);

  const handleOpenPreview = useCallback(() => {
    form.handleSubmit(modal.openCreate, () => setOpenAttendantModal(true));
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

  const handleConfirmAttendant = useCallback(() => {
    const normalized = attendantName.trim();
    if (!normalized) {
      toast.warning("Informe o nome do atendente.");
      return;
    }

    AppStorage.setAttendantName(normalized);
    setOpenAttendantModal(false);
    form.handleSubmit(modal.openCreate);
  }, [attendantName, form, modal]);

  return {
    account,
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
