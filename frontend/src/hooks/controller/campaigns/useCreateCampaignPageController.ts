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

  const { clients, setQuery } = useClient();
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

  const previewDetails = useMemo(
    () => [
      { label: "Template", value: form.selectedTemplate?.name ?? "--" },
      { label: "Categoria", value: form.selectedCategory?.name ?? "--" },
      { label: "Inicio", value: formatPreviewDate(form.dateRange?.from) },
      {
        label: "Fim",
        value: formatPreviewDate(form.dateRange?.to ?? form.dateRange?.from),
      },
      { label: "Horario", value: form.dispatchTime || "--:--" },
      { label: "Recorrencia", value: form.recurring ? "Recorrente" : "Unica" },
      {
        label: "Time zone",
        value: Intl.DateTimeFormat().resolvedOptions().timeZone || "--",
      },
      { label: "Clientes", value: String(form.selectedClients.length) },
    ],
    [
      form.dateRange?.from,
      form.dateRange?.to,
      form.dispatchTime,
      form.recurring,
      form.selectedCategory?.name,
      form.selectedClients.length,
      form.selectedTemplate?.name,
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
    handleOpenPreview,
    handleConfirmPreview,
    handleCloseAttendantModal,
    handleConfirmAttendant,
  };
}
