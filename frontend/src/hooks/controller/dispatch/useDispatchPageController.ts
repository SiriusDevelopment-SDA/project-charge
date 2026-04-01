import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import type { Cliente } from "../../../types";
import { useClient } from "../../useCliente";
import { useTemplate } from "../../useTemplates";
import { useDispatchTemplate } from "../../useDispatchTemplate";
import { processarDocumentos, validarSelecaoCliente } from "../../../utils/validation";
import { handleUploadPlanilha } from "../../../utils/hendleUploadSpreadSheat";
import { useManualLeadDispatchController } from "./useManualLeadDispatchController";
import { mapRecipientsToTemplateVars } from "../../../mappers/templateVars.mapper";
import {
  areOnlyAttendantFieldsMissing,
  getIncompleteTemplateRecipients,
  templateRequiresAttendantName,
} from "../../../validators/template.validator";
import { AppStorage } from "../../../services/storage/storage.service";
import { useAccountParam } from "../../useAccountParam";
import { getTemplateStatusLabel, isTemplateApproved } from "../../../utils/templateStatus";

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
  const account = useAccountParam();
  const [openDropdown, setOpenDropdown] = useState<"template" | "clientes" | null>(null);
  const [isDispatchPreviewOpen, setIsDispatchPreviewOpen] = useState(false);
  const [openDispatchAttendantModal, setOpenDispatchAttendantModal] = useState(false);
  const [previewMapOverride, setPreviewMapOverride] = useState<{
    selectionKey: string;
    mappedVars: import("../../../types").mappedVars[];
  } | null>(null);

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

  const previewSelectionKey = useMemo(() => {
    const audienceKey =
      dispatch.modoPage === "clientes"
        ? dispatch.selectedClientes.map((cliente) => cliente.id).join("|")
        : dispatch.selectedLeads
            .map((lead) =>
              String(
                lead.whatsapp ??
                  lead.cnpj_cpf ??
                  lead.nome_cliente ??
                  "lead-sem-identificador",
              ),
            )
            .join("|");

    return [dispatch.modoPage, dispatch.selectedTemplate?.id ?? "", audienceKey].join("::");
  }, [
    dispatch.modoPage,
    dispatch.selectedClientes,
    dispatch.selectedLeads,
    dispatch.selectedTemplate?.id,
  ]);

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

  const activeMappedVars =
    previewMapOverride?.selectionKey === previewSelectionKey
      ? previewMapOverride.mappedVars
      : previewMappedVars;

  const previewMessage = String(
    activeMappedVars?.[0]?.mensagem ??
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

  const mergeFetchedClients = useCallback(
    (baseClients: Cliente[], fetchedClients: Cliente[]) => {
      const fetchedById = new Map(
        fetchedClients.map((cliente) => [cliente.id, cliente]),
      );

      return baseClients.map(
        (cliente) => fetchedById.get(cliente.id) ?? cliente,
      );
    },
    [],
  );

  const handleCloseFloatingMenus = useCallback(() => {
    setOpenDropdown(null);
  }, []);

  const handleClientsChange = useCallback(
    async (value: Cliente[]) => {
      if (!dispatch.selectedTemplate) {
        dispatch.setSelectedClientes([]);
        return;
      }

      const selectedClientsById = new Map(
        dispatch.selectedClientes.map((cliente) => [cliente.id, cliente]),
      );
      const nextClientIds = new Set(value.map((cliente) => cliente.id));
      const removedClients = dispatch.selectedClientes.filter(
        (cliente) => !nextClientIds.has(cliente.id),
      );

      let hydratedClients = value.map(
        (cliente) => selectedClientsById.get(cliente.id) ?? cliente,
      );
      if (value.length <= dispatch.selectedClientes.length) {
        const clientesValidos = hydratedClients.filter((cliente) =>
          validarSelecaoCliente(cliente, dispatch.selectedTemplate ?? undefined),
        );

        dispatch.setSelectedClientes(clientesValidos);
        return;
      }

      if (dispatch.selectedTemplate.category === "Cobrança") {
        if (removedClients.length > 0) {
          const clientesValidos = hydratedClients.filter((cliente) =>
            validarSelecaoCliente(cliente, dispatch.selectedTemplate ?? undefined),
          );

          dispatch.setSelectedClientes(clientesValidos);
          return;
        }

        const addedClients = hydratedClients.filter(
          (cliente) => !selectedClientsById.has(cliente.id),
        );

        const needInvoices = addedClients.filter(
          (cliente) => cliente.invoices?.status !== "success",
        );

        if (needInvoices.length) {
          const fetchedClients = await fetchInvoices(needInvoices);
          hydratedClients = mergeFetchedClients(hydratedClients, fetchedClients);
        }
      }

      const clientesValidos = hydratedClients.filter((cliente) =>
        validarSelecaoCliente(cliente, dispatch.selectedTemplate ?? undefined),
      );

      dispatch.setSelectedClientes(clientesValidos);
    },
    [
      dispatch.selectedClientes,
      dispatch.selectedTemplate,
      dispatch.setSelectedClientes,
      fetchInvoices,
      mergeFetchedClients,
    ],
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

  const handleOpenDispatchPreview = useCallback(async () => {
    if (!dispatch.selectedTemplate) return;

    if (!isTemplateApproved(dispatch.selectedTemplate.meta_status)) {
      toast.warning(
        `O template ${dispatch.selectedTemplate.name} ainda nao pode ser usado. Status atual: ${getTemplateStatusLabel(dispatch.selectedTemplate.meta_status)}.`,
      );
      return;
    }

    if (
      templateRequiresAttendantName(dispatch.selectedTemplate) &&
      !AppStorage.getAttendantName() &&
      AppStorage.getAuthMode() === "embed"
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

    let hydratedSelectedClients = dispatch.selectedClientes;

    if (
      dispatch.modoPage === "clientes" &&
      dispatch.selectedTemplate.category === "Cobrança"
    ) {
      const needInvoices = dispatch.selectedClientes.filter(
        (cliente) => cliente.invoices?.status !== "success",
      );

      if (needInvoices.length) {
        const fetchedClients = await fetchInvoices(needInvoices);
        hydratedSelectedClients = mergeFetchedClients(
          dispatch.selectedClientes,
          fetchedClients,
        );
        dispatch.setSelectedClientes(hydratedSelectedClients);
      }
    }

    const freshSource =
      dispatch.modoPage === "clientes"
        ? hydratedSelectedClients
        : dispatch.selectedLeads;

    // Validação: sem AppStorage, para detectar campos realmente ausentes no recipient
    const freshMappedVarsForValidation =
      freshSource.length
        ? mapRecipientsToTemplateVars(freshSource, dispatch.selectedTemplate, {
            filterByTemplateVars: false,
            skipStorage: true,
          })
        : [];

    // Preview: com AppStorage, para exibir valores já confirmados anteriormente
    const freshMappedVars =
      freshSource.length
        ? mapRecipientsToTemplateVars(freshSource, dispatch.selectedTemplate, {
            filterByTemplateVars: false,
          })
        : [];

    const incompleteRecipients = getIncompleteTemplateRecipients(
      dispatch.selectedTemplate,
      freshMappedVarsForValidation,
    );

    if (incompleteRecipients.length) {
      if (
        AppStorage.getAuthMode() === "embed" &&
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

    if (freshMappedVars.length) {
      setPreviewMapOverride({
        selectionKey: previewSelectionKey,
        mappedVars: freshMappedVars,
      });
    }

    manualLead.prepareDispatchPreview();
  }, [
    dispatch,
    fetchInvoices,
    manualLead,
    mergeFetchedClients,
    previewAudienceCount,
    previewSelectionKey,
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

    AppStorage.setAttendantName(normalized);
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

    // Store the freshly-computed vars (with attendant name) so previewMessage shows correct content
    if (refreshedMappedVars.length) {
      setPreviewMapOverride({
        selectionKey: previewSelectionKey,
        mappedVars: refreshedMappedVars,
      });
    }

    setIsDispatchPreviewOpen(true);
  }, [
    dispatch.modoPage,
    dispatch.selectedClientes,
    dispatch.selectedLeads,
    dispatch.selectedTemplate,
    hasPendingManualLead,
    manualLead,
    previewSelectionKey,
  ]);

  return {
    account,
    clients,
    templates,
    dispatch,
    manualLead,
    openDropdown,
    setOpenDropdown,
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
