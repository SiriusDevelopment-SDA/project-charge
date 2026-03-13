import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import type { Cliente } from "../../../types";
import { useClient } from "../../useCliente";
import { useTemplate } from "../../useTemplates";
import { useDispatchTemplate } from "../../useDispatchTemplate";
import { processarDocumentos, validarSelecaoCliente } from "../../../utils/validation";
import { handleUploadPlanilha } from "../../../utils/hendleUploadSpreadSheat";
import { useManualLeadDispatchController } from "./useManualLeadDispatchController";
import {
  areOnlyAttendantFieldsMissing,
  getIncompleteTemplateRecipients,
  getStoredAttendantName,
  getStoredAuthMode,
  mapRecipientsToTemplateVars,
  setStoredAttendantName,
  templateRequiresAttendantName,
} from "../../../mappers/templateVars.mapper";

function getDispatchBatchLabel(status: string) {
  if (status === "queued") return "Na fila";
  if (status === "processing") return "Em andamento";
  if (status === "completed") return "Concluido";
  if (status === "partial") return "Concluido com falhas";
  if (status === "failed") return "Falhou";
  return "Processando";
}

export function useDispatchPageController() {
  const navigate = useNavigate();
  const account = new URLSearchParams(window.location.search).get("account");
  const [openDropdown, setOpenDropdown] = useState<"template" | "clientes" | null>(null);
  const [isDispatchPreviewOpen, setIsDispatchPreviewOpen] = useState(false);
  const [openDispatchAttendantModal, setOpenDispatchAttendantModal] = useState(false);
  const [openCategoryDropdown, setOpenCategoryDropdown] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const categoryFilterRef = useRef<SVGSVGElement | null>(null);

  const { clients, setQuery, fetchInvoices } = useClient();
  const templates = useTemplate();
  const dispatch = useDispatchTemplate();
  const manualLead = useManualLeadDispatchController({
    modoPage: dispatch.modoPage,
    selectedTemplate: dispatch.selectedTemplate,
    selectedLeads: dispatch.selectedLeads,
    setSelectedLeads: dispatch.setSelectedLeads,
    sendTemplate: dispatch.sendTemplate,
    onPreviewReady: () => setIsDispatchPreviewOpen(true),
  });

  const isFinishedBatch =
    dispatch.activeDispatchBatch?.status === "completed" ||
    dispatch.activeDispatchBatch?.status === "partial" ||
    dispatch.activeDispatchBatch?.status === "failed";

  const typedWhatsappDigits = manualLead.whatsappValue.replace(/\D/g, "");
  const hasPendingManualLead =
    dispatch.modoPage === "leads" &&
    typedWhatsappDigits.length >= 12 &&
    !dispatch.selectedLeads.some(
      (lead) =>
        String(lead.whatsapp ?? "").replace(/\D/g, "") === typedWhatsappDigits,
    );

  const previewAudienceCount =
    dispatch.modoPage === "clientes"
      ? dispatch.selectedClientes.length
      : dispatch.selectedLeads.length + (hasPendingManualLead ? 1 : 0);

  const previewMappedVars = useMemo(() => {
    if (!dispatch.selectedTemplate) return [];

    const source =
      dispatch.modoPage === "clientes"
        ? dispatch.selectedClientes
        : dispatch.selectedLeads;

    if (!source.length) return [];

    return mapRecipientsToTemplateVars(source, dispatch.selectedTemplate, {
      filterByTemplateVars: false,
    });
  }, [
    dispatch.modoPage,
    dispatch.selectedClientes,
    dispatch.selectedLeads,
    dispatch.selectedTemplate,
  ]);

  const previewMessage = String(
    previewMappedVars?.[0]?.mensagem ??
      dispatch.templateMapVars?.[0]?.mensagem ??
      dispatch.selectedTemplate?.message ??
      "Sem mensagem de template",
  );

  const previewDetails = useMemo(() => {
    const leadSource =
      hasPendingManualLead && dispatch.selectedLeads.length > 0
        ? "Lista atual + numero manual"
        : hasPendingManualLead
          ? "Numero manual"
          : dispatch.selectedLeads.some((lead) => lead.inputSource === "spreadsheet")
            ? "Planilha"
            : dispatch.selectedLeads.some((lead) => lead.inputSource === "manual")
              ? "Numero manual"
              : "Selecao atual";

    return [
      {
        label: "Fluxo",
        value: dispatch.modoPage === "clientes" ? "Clientes ativos" : "Leads",
      },
      { label: "Template", value: dispatch.selectedTemplate?.name ?? "--" },
      { label: "Disparo", value: "Imediato" },
      {
        label: "Origem",
        value:
          dispatch.modoPage === "clientes" ? "ERP / selecao atual" : leadSource,
      },
      { label: "Selecionados", value: String(previewAudienceCount) },
    ];
  }, [
    dispatch.modoPage,
    dispatch.selectedLeads,
    dispatch.selectedTemplate?.name,
    hasPendingManualLead,
    previewAudienceCount,
  ]);

  const handleCloseFloatingMenus = useCallback(() => {
    setOpenDropdown(null);
    setOpenCategoryDropdown(false);
  }, []);

  const handleClientsChange = useCallback(
    (value: Cliente[]) => {
      const clientesValidos = value.filter((cliente) => {
        if (!dispatch.selectedTemplate) return false;
        return validarSelecaoCliente(cliente, dispatch.selectedTemplate);
      });

      dispatch.setSelectedClientes(clientesValidos);

      if (
        dispatch.selectedTemplate?.category === "CobranÃ§a" &&
        clientesValidos.length
      ) {
        void fetchInvoices(clientesValidos);
      }
    },
    [dispatch.selectedTemplate, dispatch.setSelectedClientes, fetchInvoices],
  );

  const handleLeadUpload = useCallback(
    (file: File) => {
      if (dispatch.modoPage === "leads" && manualLead.shouldDisableLeadUpload) {
        toast.warning(
          "Escolha apenas uma fonte para leads. Limpe o numero manual antes de importar planilha.",
        );
        return;
      }

      handleUploadPlanilha({
        file,
        clients,
        setQuery,
        account,
        setSelectedClientes: dispatch.setSelectedClientes,
        setSelectedLeads: dispatch.setSelectedLeads,
        processarDocumentos,
      });
    },
    [
      account,
      clients,
      dispatch.modoPage,
      dispatch.setSelectedClientes,
      dispatch.setSelectedLeads,
      manualLead.shouldDisableLeadUpload,
      setQuery,
    ],
  );

  const handleOpenDispatchPreview = useCallback(() => {
    if (!dispatch.selectedTemplate) return;

    if (
      templateRequiresAttendantName(dispatch.selectedTemplate) &&
      !getStoredAttendantName() &&
      getStoredAuthMode() === "embed"
    ) {
      setOpenDispatchAttendantModal(true);
      return;
    }

    if (
      dispatch.modoPage === "clientes" &&
      dispatch.selectedClientes.length === 0
    ) {
      toast.warning("Selecione ao menos um cliente para visualizar o preview.");
      return;
    }

    if (dispatch.modoPage === "leads") {
      if (typedWhatsappDigits && typedWhatsappDigits.length < 12) {
        toast.warning("Numero de WhatsApp invalido. Use o padrao 55DDNUMERO.");
        return;
      }

      if (previewAudienceCount === 0) {
        toast.warning(
          "Selecione ao menos um lead ou informe um numero valido para visualizar o preview.",
        );
        return;
      }
    }

    if (
      ((dispatch.modoPage === "clientes" &&
        dispatch.selectedClientes.length > 0) ||
        (dispatch.modoPage === "leads" &&
          dispatch.selectedLeads.length > 0)) &&
      previewMappedVars.length === 0
    ) {
      toast.warning(
        "Ainda nao foi possivel validar todas as variaveis do template.",
      );
      return;
    }

    const incompleteRecipients = getIncompleteTemplateRecipients(
      dispatch.selectedTemplate,
      previewMappedVars,
    );

    if (incompleteRecipients.length) {
      if (
        getStoredAuthMode() === "embed" &&
        areOnlyAttendantFieldsMissing(incompleteRecipients)
      ) {
        setOpenDispatchAttendantModal(true);
        return;
      }

      if (areOnlyAttendantFieldsMissing(incompleteRecipients)) {
        toast.warning("Nao foi possivel identificar o nome do usuario logado.");
        return;
      }

      const pendingFields = incompleteRecipients[0]?.missingFields.join(", ");
      toast.warning(
        pendingFields
          ? `Preencha todas as variaveis obrigatorias antes do preview. Campos pendentes: ${pendingFields}.`
          : "Preencha todas as variaveis obrigatorias antes do preview.",
      );
      return;
    }

    manualLead.prepareDispatchPreview();
  }, [
    dispatch.modoPage,
    dispatch.selectedClientes.length,
    dispatch.selectedLeads.length,
    dispatch.selectedTemplate,
    manualLead,
    previewAudienceCount,
    previewMappedVars,
    typedWhatsappDigits,
  ]);

  const handleConfirmDispatchPreview = useCallback(async () => {
    setIsDispatchPreviewOpen(false);
    await manualLead.submitDispatch();
  }, [manualLead]);

  const handleOpenBatchHistory = useCallback(() => {
    if (!dispatch.activeDispatchBatch) return;

    const searchParams = new URLSearchParams();
    if (account) {
      searchParams.set("account", account);
    }
    searchParams.set("scope", "manual");
    searchParams.set("batchId", dispatch.activeDispatchBatch.id);
    navigate(`/historico?${searchParams.toString()}`);
  }, [account, dispatch.activeDispatchBatch, navigate]);

  const handleConfirmAttendant = useCallback(() => {
    const normalized = manualLead.attendantName.trim();
    if (!normalized) {
      toast.warning("Informe o nome do atendente.");
      return;
    }

    setStoredAttendantName(normalized);
    setOpenDispatchAttendantModal(false);

    if (dispatch.modoPage === "leads" && hasPendingManualLead) {
      manualLead.prepareDispatchPreview();
      return;
    }

    const refreshedMappedVars =
      dispatch.selectedTemplate &&
      (dispatch.modoPage === "clientes"
        ? dispatch.selectedClientes.length > 0
        : dispatch.selectedLeads.length > 0)
        ? mapRecipientsToTemplateVars(
            dispatch.modoPage === "clientes"
              ? dispatch.selectedClientes
              : dispatch.selectedLeads,
            dispatch.selectedTemplate,
            { filterByTemplateVars: false },
          )
        : [];

    const remainingPendingRecipients = dispatch.selectedTemplate
      ? getIncompleteTemplateRecipients(
          dispatch.selectedTemplate,
          refreshedMappedVars,
        )
      : [];

    if (remainingPendingRecipients.length) {
      const pendingFields = remainingPendingRecipients[0]?.missingFields.join(", ");
      toast.warning(
        pendingFields
          ? `Preencha todas as variaveis obrigatorias antes do preview. Campos pendentes: ${pendingFields}.`
          : "Preencha todas as variaveis obrigatorias antes do preview.",
      );
      return;
    }

    setIsDispatchPreviewOpen(true);
  }, [
    dispatch.modoPage,
    dispatch.selectedClientes,
    dispatch.selectedLeads,
    dispatch.selectedTemplate,
    hasPendingManualLead,
    manualLead,
  ]);

  return {
    account,
    clients,
    templates,
    dispatch,
    manualLead,
    categoryMenuRef,
    categoryFilterRef,
    openDropdown,
    setOpenDropdown,
    openCategoryDropdown,
    setOpenCategoryDropdown,
    isDispatchPreviewOpen,
    setIsDispatchPreviewOpen,
    openDispatchAttendantModal,
    setOpenDispatchAttendantModal,
    isFinishedBatch,
    hasPendingManualLead,
    previewAudienceCount,
    previewMessage,
    previewDetails,
    batchLabel: dispatch.activeDispatchBatch
      ? getDispatchBatchLabel(dispatch.activeDispatchBatch.status)
      : "Processando",
    searchTemplateName: templates.searchTemplateName,
    setSearchTemplateName: templates.setSearchTemplateName,
    categoryTemplateFilter: templates.categoryTemplateFilter,
    setCategoryTemplateFilter: templates.setCategoryTemplateFilter,
    filteredTemplates: templates.filteredTemplates,
    categories: templates.categories,
    handleClientSearch: setQuery,
    handleCloseFloatingMenus,
    handleClientsChange,
    handleLeadUpload,
    handleOpenDispatchPreview,
    handleConfirmDispatchPreview,
    handleOpenBatchHistory,
    handleConfirmAttendant,
  };
}
