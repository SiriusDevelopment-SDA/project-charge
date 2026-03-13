import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Api } from "../../../services/api";
import { ClientContext } from "../../../context/contextClients";
import {
  buildTemplateRecipients,
  diagnoseTemplateRecipients,
  mapRecipientsToTemplateVars,
} from "../../../mappers/templateVars.mapper";
import type {
  Cliente,
  DispatchBatchStatus,
  Lead,
  mappedVars,
  Template,
  TemplateRecipient,
} from "../../../types";
import { getErrorMessage } from "../../../utils/error";

type SendTemplateStartResponse = {
  accepted: boolean;
  batchId: string;
  status: DispatchBatchStatus["status"];
  total: number;
  rateLimitPerSecond: number;
  estimatedDurationSeconds: number;
};

const DISPATCH_BATCH_POLL_INTERVAL_MS = 1000;

function isDispatchBatchFinished(status?: DispatchBatchStatus["status"]) {
  return status === "completed" || status === "partial" || status === "failed";
}

export function useDispatchTemplateController() {
  const [selectedClientes, setSelectedClientes] = useState<Cliente[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Lead[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [modoPage, setModoPage] = useState<"clientes" | "leads">("clientes");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeDispatchBatch, setActiveDispatchBatch] = useState<DispatchBatchStatus | null>(null);
  const completedBatchToastRef = useRef<string | null>(null);
  const { fetchInvoices } = useContext(ClientContext);

  const templateMapVars = useMemo(() => {
    if (!selectedTemplate) return [] as mappedVars[];

    const source: Array<Cliente | Lead> =
      modoPage === "clientes" ? selectedClientes : selectedLeads;
    if (!source.length) return [] as mappedVars[];

    try {
      return mapRecipientsToTemplateVars(source, selectedTemplate, {
        filterByTemplateVars: false,
      });
    } catch (error: unknown) {
      console.error("[dispatch-debug] erro ao mapear variaveis do template", {
        modoPage,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        selectedCount: source.length,
        error,
        source,
      });
      return [] as mappedVars[];
    }
  }, [selectedTemplate, selectedClientes, selectedLeads, modoPage]);

  useEffect(() => {
    if (selectedTemplate?.category !== "Cobrança") return;

    const needInvoices = selectedClientes.filter(
      (client) => !client.invoices || client.invoices.status === "error",
    );

    if (!needInvoices.length) return;

    void fetchInvoices(needInvoices);
  }, [selectedTemplate, selectedClientes, fetchInvoices]);

  const clearActiveDispatchBatch = useCallback(() => {
    setActiveDispatchBatch(null);
    completedBatchToastRef.current = null;
  }, []);

  const notifyFinishedBatch = useCallback((batch: DispatchBatchStatus) => {
    if (completedBatchToastRef.current === batch.id) {
      return;
    }

    completedBatchToastRef.current = batch.id;

    if (batch.status === "completed") {
      toast.success(`Lote concluido com sucesso! (${batch.successCount} mensagens)`);
      return;
    }

    if (batch.status === "partial") {
      toast.warning(
        `Lote concluido com falhas. Sucesso: ${batch.successCount} | Falhas: ${batch.failedCount}`,
      );
      return;
    }

    toast.error(batch.errorMessage || "O lote de disparo falhou.");
  }, []);

  const fetchDispatchBatchStatus = useCallback(
    async (batchId: string, showErrorToast = true) => {
      try {
        const account = new URLSearchParams(window.location.search).get("account");
        if (!account) return;

        const response = await Api.post<DispatchBatchStatus>("/templates/batches/status", {
          account,
          batchId,
        });

        const batch = response.data;
        setActiveDispatchBatch(batch);

        if (isDispatchBatchFinished(batch.status)) {
          notifyFinishedBatch(batch);
        }
      } catch (error: unknown) {
        if (showErrorToast) {
          toast.error(getErrorMessage(error, "Erro ao atualizar o progresso do lote"));
        }
      }
    },
    [notifyFinishedBatch],
  );

  const handleSubmit = useCallback(async (templateId: string, to: TemplateRecipient[]) => {
    try {
      const account = new URLSearchParams(window.location.search).get("account");

      const response = await Api.post<SendTemplateStartResponse>("/templates/send", {
        templateId,
        account,
        to,
      });
      const result = response.data;

      if (result?.accepted && result.batchId) {
        completedBatchToastRef.current = null;
        setActiveDispatchBatch({
          id: result.batchId,
          status: result.status,
          totalRecipients: result.total,
          processedRecipients: 0,
          successCount: 0,
          failedCount: 0,
          rateLimitPerSecond: result.rateLimitPerSecond,
          progressPercentage: 0,
          estimatedDurationSeconds: result.estimatedDurationSeconds,
          startedAt: null,
          finishedAt: null,
          errorMessage: null,
        });
        toast.info(`Lote iniciado para ${result.total} mensagens.`);
        return;
      }

      toast.warn("Lote iniciado, mas sem confirmacao completa.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao enviar mensagens"));
    }
  }, []);

  const logInvalidRecipientsDebug = useCallback(
    (mappedVarsList: mappedVars[]) => {
      if (!selectedTemplate) return;

      const sourceCount =
        modoPage === "clientes" ? selectedClientes.length : selectedLeads.length;
      const diagnostics = diagnoseTemplateRecipients(selectedTemplate, mappedVarsList);

      console.groupCollapsed("[dispatch-debug] nenhum destinatario valido para envio");
      console.log("resumo", {
        modoPage,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        sourceCount,
        mappedCount: mappedVarsList.length,
      });
      console.table(
        diagnostics.map((item) => ({
          index: item.index,
          number: item.number || "(vazio)",
          missingNumber: item.missingNumber,
          missingFields: item.missingFields.join(", ") || "-",
        })),
      );
      console.log("detalhes", diagnostics);
      console.groupEnd();

      const firstInvalidRecipient = diagnostics.find(
        (item) => item.missingNumber || item.missingFields.length > 0,
      );

      const reason = firstInvalidRecipient
        ? [
            firstInvalidRecipient.missingNumber ? "whatsapp" : "",
            ...firstInvalidRecipient.missingFields,
          ]
            .filter(Boolean)
            .join(", ")
        : "";

      toast.warning(
        reason
          ? `Nenhum ${
              modoPage === "clientes" ? "cliente" : "lead"
            } valido para envio. Veja o console. Campos faltando: ${reason}`
          : `Nenhum ${
              modoPage === "clientes" ? "cliente" : "lead"
            } valido para envio. Veja o console para o debug.`,
      );
    },
    [modoPage, selectedClientes.length, selectedLeads.length, selectedTemplate],
  );

  const sendTemplate = useCallback(
    async (extraLeads?: Lead[]) => {
      if (isSubmitting) return;
      if (activeDispatchBatch && !isDispatchBatchFinished(activeDispatchBatch.status)) {
        toast.info("Ja existe um lote de disparo em andamento.");
        return;
      }
      if (!selectedTemplate) return;

      const baseMappedVars =
        modoPage === "leads" && Array.isArray(extraLeads) && extraLeads.length
          ? mapRecipientsToTemplateVars([...selectedLeads, ...extraLeads], selectedTemplate, {
              filterByTemplateVars: false,
            })
          : templateMapVars;

      const recipients = buildTemplateRecipients(selectedTemplate, baseMappedVars);

      if (!recipients.length) {
        logInvalidRecipientsDebug(baseMappedVars);
        return;
      }

      try {
        setIsSubmitting(true);
        await handleSubmit(selectedTemplate.id, recipients);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      activeDispatchBatch,
      selectedTemplate,
      templateMapVars,
      handleSubmit,
      isSubmitting,
      logInvalidRecipientsDebug,
      modoPage,
      selectedLeads,
    ],
  );

  useEffect(() => {
    if (!activeDispatchBatch?.id) return;
    if (isDispatchBatchFinished(activeDispatchBatch.status)) return;

    const { id: batchId } = activeDispatchBatch;

    void fetchDispatchBatchStatus(batchId);

    const intervalId = window.setInterval(() => {
      void fetchDispatchBatchStatus(batchId, false);
    }, DISPATCH_BATCH_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [activeDispatchBatch?.id, activeDispatchBatch?.status, fetchDispatchBatchStatus]);

  const isSending =
    isSubmitting ||
    Boolean(activeDispatchBatch && !isDispatchBatchFinished(activeDispatchBatch.status));

  return {
    selectedClientes,
    setSelectedClientes,
    selectedLeads,
    setSelectedLeads,
    selectedTemplate,
    setSelectedTemplate,
    templateMapVars,
    modoPage,
    setModoPage,
    sendTemplate,
    isSending,
    activeDispatchBatch,
    clearActiveDispatchBatch,
  };
}
