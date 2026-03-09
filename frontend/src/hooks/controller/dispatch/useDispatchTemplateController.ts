import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Api } from "../../../services/api";
import { ClientContext } from "../../../context/contextClients";
import {
  mapRecipientsToTemplateVars,
  buildTemplateRecipients,
} from "../../../mappers/templateVars.mapper";
import type {
  Cliente,
  Lead,
  mappedVars,
  Template,
  TemplateRecipient,
} from "../../../types";
import { getErrorMessage } from "../../../utils/error";

export function useDispatchTemplateController() {
  const [selectedClientes, setSelectedClientes] = useState<Cliente[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Lead[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [modoPage, setModoPage] = useState<"clientes" | "leads">("clientes");
  const [isSending, setIsSending] = useState(false);
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
    } catch {
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
      const account = new URLSearchParams(window.location.search).get("account");

      const response = await Api.post("/templates/send", { templateId, account, to });
      const result = response.data;

      if (result?.success) {
        toast.success(`Disparo enviado com sucesso! (${result.total} mensagens)`);
        return;
      }

      toast.warn("Disparo enviado, mas sem confirmacao completa.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao enviar mensagens"));
    }
  }, []);

  const sendTemplate = useCallback(
    async (extraLeads?: Lead[]) => {
      if (isSending) return;
      if (!selectedTemplate) return;

      const baseMappedVars =
        modoPage === "leads" && Array.isArray(extraLeads) && extraLeads.length
          ? mapRecipientsToTemplateVars([...selectedLeads, ...extraLeads], selectedTemplate, {
              filterByTemplateVars: false,
            })
          : templateMapVars;

      const recipients = buildTemplateRecipients(selectedTemplate, baseMappedVars);

      if (!recipients.length) {
        toast.warning(
          modoPage === "clientes"
            ? "Nenhum cliente valido para envio"
            : "Nenhum lead valido para envio",
        );
        return;
      }

      try {
        setIsSending(true);
        await handleSubmit(selectedTemplate.id, recipients);
      } finally {
        setIsSending(false);
      }
    },
    [selectedTemplate, templateMapVars, handleSubmit, isSending, modoPage, selectedLeads],
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
    isSending,
  };
}
