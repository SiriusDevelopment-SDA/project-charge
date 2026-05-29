import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import type { Cliente } from "../../../types";
import { useClient } from "../../useCliente";
import { useTemplate } from "../../useTemplates";
import { useDispatchTemplate } from "../../useDispatchTemplate";
import { useNotificameChannels } from "../../useNotificameChannels";
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
import { templateRequiresInvoiceData } from "../../../utils/templateRequirements";
import { ClientService } from "../../../services/client/client.service";

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
  const [openClientIds, setOpenClientIds] = useState<Set<string> | null>(null);
  const openClientIdsFetchedForRef = useRef<string | null>(null);
  const [previewMapOverride, setPreviewMapOverride] = useState<{
    selectionKey: string;
    mappedVars: import("../../../types").mappedVars[];
  } | null>(null);

  const { clients, setQuery, fetchInvoices } = useClient();
  const fetchInvoicesRef = useRef(fetchInvoices);
  fetchInvoicesRef.current = fetchInvoices;
  const templates = useTemplate();
  const dispatch = useDispatchTemplate();
  const {
    channels,
    isLoading: isLoadingChannels,
    isEmpty: hasNoChannels,
  } = useNotificameChannels();
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

  const hasInvoiceUpdates = useCallback(
    (currentClients: Cliente[], nextClients: Cliente[]) => {
      return nextClients.some((cliente, index) => {
        const current = currentClients[index];
        const currentInvoice = current?.invoices?.list?.[0];
        const nextInvoice = cliente.invoices?.list?.[0];

        return (
          current?.invoices?.status !== cliente.invoices?.status ||
          current?.invoices?.list?.length !== cliente.invoices?.list?.length ||
          currentInvoice?.invoice_due_date !== nextInvoice?.invoice_due_date ||
          currentInvoice?.ticket_pdf_link !== nextInvoice?.ticket_pdf_link ||
          currentInvoice?.ticket_digitable_line !== nextInvoice?.ticket_digitable_line ||
          currentInvoice?.invoice_amount !== nextInvoice?.invoice_amount ||
          currentInvoice?.contract_id !== nextInvoice?.contract_id ||
          currentInvoice?.code_pix !== nextInvoice?.code_pix
        );
      });
    },
    [],
  );

  /**
   * Para templates de cobrança, busca o código PIX do ERP para clientes cujo
   * snapshot local não tem pixCode (ex: IXC). Para SGP, o pixCode já vem do banco.
   * Retorna a mesma referência se nenhum PIX precisou ser buscado.
   */
  const fetchAndMergePixCodes = useCallback(async (targetClients: Cliente[]): Promise<Cliente[]> => {
    const needsPix: { idx: number; companyId: string; invoiceId: string }[] = [];

    targetClients.forEach((client, idx) => {
      const invoice = client.invoices?.list?.[0];
      if (!invoice?.invoice_id) return;
      // Treat falsy OR the legacy "null" string as missing PIX
      const pix = invoice.code_pix;
      if (pix && pix !== 'null') return; // already has a real PIX code
      const companyId = client.company?.id;
      if (!companyId) return;
      needsPix.push({ idx, companyId, invoiceId: invoice.invoice_id });
    });

    if (!needsPix.length) return targetClients;

    // Group by companyId to batch calls
    const byCompany = new Map<string, { companyId: string; entries: typeof needsPix }>();
    for (const entry of needsPix) {
      const group = byCompany.get(entry.companyId) ?? { companyId: entry.companyId, entries: [] };
      group.entries.push(entry);
      byCompany.set(entry.companyId, group);
    }

    const updated = [...targetClients];
    let changed = false;

    await Promise.allSettled(
      [...byCompany.values()].map(async ({ companyId, entries }) => {
        const invoiceIds = [...new Set(entries.map((e) => e.invoiceId))];
        try {
          const res = await ClientService.fetchPixCodes(companyId, invoiceIds);
          const pixByInvoiceId = new Map(
            res.data.results
              .filter((r) => r.pix && r.pix !== 'null')
              .map((r) => [r.invoiceId, r.pix]),
          );
          for (const { idx, invoiceId } of entries) {
            const pix = pixByInvoiceId.get(invoiceId);
            if (!pix) continue;
            const client = updated[idx];
            const list = client.invoices?.list ?? [];
            updated[idx] = {
              ...client,
              invoices: {
                ...client.invoices!,
                list: list.map((inv, i) => (i === 0 ? { ...inv, code_pix: pix } : inv)),
              },
            };
            changed = true;
          }
        } catch {
          // silently skip — dispatch will warn if PIX is still missing
        }
      }),
    );

    return changed ? updated : targetClients;
  }, []);

  useEffect(() => {
    if (dispatch.modoPage !== "clientes") {
      return;
    }

    if (!templateRequiresInvoiceData(dispatch.selectedTemplate)) {
      return;
    }

    if (!dispatch.selectedClientes.length) {
      return;
    }

    const needInvoices = dispatch.selectedClientes.filter(
      (cliente) => cliente.invoices?.status !== "success",
    );

    if (!needInvoices.length) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const fetchedClients = await fetchInvoicesRef.current(needInvoices);

      if (cancelled) {
        return;
      }

      const mergedClients = mergeFetchedClients(
        dispatch.selectedClientes,
        fetchedClients,
      );

      if (!hasInvoiceUpdates(dispatch.selectedClientes, mergedClients)) {
        return;
      }

      dispatch.setSelectedClientes(mergedClients);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    dispatch.modoPage,
    dispatch.selectedClientes,
    dispatch.selectedTemplate,
    dispatch.setSelectedClientes,
    hasInvoiceUpdates,
    mergeFetchedClients,
  ]);

  useEffect(() => {
    if (!account || !templateRequiresInvoiceData(dispatch.selectedTemplate)) {
      setOpenClientIds(null);
      openClientIdsFetchedForRef.current = null;
      return;
    }

    if (openClientIdsFetchedForRef.current === account) return;

    openClientIdsFetchedForRef.current = account;

    void ClientService.getOpenClientIds(account).then((res) => {
      setOpenClientIds(new Set(res.data.clientIds));
    }).catch(() => {
      setOpenClientIds(null);
    });
  }, [account, dispatch.selectedTemplate]);

  const isClientDisabled = useCallback(
    (cliente: { id: string }) => {
      if (!openClientIds) return false;
      return !openClientIds.has(cliente.id);
    },
    [openClientIds],
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

      if (templateRequiresInvoiceData(dispatch.selectedTemplate)) {
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
      templateRequiresInvoiceData(dispatch.selectedTemplate)
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
      }

      // Fetch PIX codes from ERP for clients missing them (e.g. IXC has no PIX in local snapshot).
      // SGP already has pixCode in the local DB — those will be skipped automatically.
      const withPix = await fetchAndMergePixCodes(hydratedSelectedClients);
      if (withPix !== hydratedSelectedClients) {
        hydratedSelectedClients = withPix;
      }

      dispatch.setSelectedClientes(hydratedSelectedClients);
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
    fetchAndMergePixCodes,
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
    channels,
    isLoadingChannels,
    hasNoChannels,
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
    templateTypeFilter: templates.templateTypeFilter,
    setTemplateTypeFilter: templates.setTemplateTypeFilter,
    filteredTemplates: templates.filteredTemplates,
    categories: templates.categories,
    isClientDisabled,
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
