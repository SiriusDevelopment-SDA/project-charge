import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Api } from "../../../services/api";
import { useClient } from "../../useCliente";
import { mapRecipientsToTemplateVars } from "../../../mappers/templateVars.mapper";
import { buildTemplateRecipients } from "../../../mappers/templateRecipient.builder";
import type {
  Cliente,
  Lead,
  mappedVars,
  Template,
  TemplateRecipient,
} from "../../../types";
import { getErrorMessage } from "../../../utils/error";
import { useAccountParam } from "../../useAccountParam";
import { useBatchStatusQuery } from "../../queries/useLatestDispatchReportQuery";

export function useDispatchTemplateController() {
  const account = useAccountParam();
  const [selectedClientes, setSelectedClientes] = useState<Cliente[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Lead[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [modoPage, setModoPage] = useState<"clientes" | "leads">("clientes");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const { fetchInvoices } = useClient();

  const { data: activeDispatchBatch = null } = useBatchStatusQuery(account, activeBatchId);

  const clearActiveDispatchBatch = useCallback(() => {
    setActiveBatchId(null);
  }, []);

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

  const handleSubmit = useCallback(async (templateId: string, to: TemplateRecipient[]) => {
    try {
      const response = await Api.post<{ batchId: string; queued: number }>("/templates/send", {
        templateId,
        account,
        to,
      });
      const result = response.data;
      setActiveBatchId(result.batchId);
      toast.success("Disparo efetuado!");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao enviar mensagens"));
    }
  }, [account]);

  const sendTemplate = useCallback(
    async (extraLeads?: Lead[]) => {
      if (isSubmitting) return;
      if (!selectedTemplate) return;

      // Always recompute fresh so AppStorage values set just before dispatch
      // (e.g. attendant name confirmed in modal) are picked up correctly.
      const source =
        modoPage === "leads" && Array.isArray(extraLeads) && extraLeads.length > 0
          ? [...selectedLeads, ...extraLeads]
          : modoPage === "clientes"
          ? selectedClientes
          : selectedLeads;

      const freshMappedVars = mapRecipientsToTemplateVars(source, selectedTemplate, {
        filterByTemplateVars: false,
      });

      const recipients = buildTemplateRecipients(selectedTemplate, freshMappedVars);

      if (!recipients.length) return;

      try {
        setIsSubmitting(true);
        await handleSubmit(selectedTemplate.id, recipients);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      selectedTemplate,
      handleSubmit,
      isSubmitting,
      modoPage,
      selectedLeads,
      selectedClientes,
    ],
  );

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
    isSending: isSubmitting,
    activeDispatchBatch,
    clearActiveDispatchBatch,
  };
}
