import { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Api } from "../../../services/api";
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
import { getTemplateStatusLabel, isTemplateApproved } from "../../../utils/templateStatus";

export function useDispatchTemplateController() {
  const account = useAccountParam();
  const [selectedClientes, setSelectedClientes] = useState<Cliente[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Lead[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [modoPage, setModoPage] = useState<"clientes" | "leads">("clientes");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

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

  const handleSubmit = useCallback(async (templateId: string, to: TemplateRecipient[]) => {
    try {
      const payload = {
        templateId,
        account,
        to,
      };

      const orderDetailsRecipients = to.filter((recipient) => {
        if (!Array.isArray(recipient.components)) {
          console.error('[dispatch-debug] recipient.components nao e array:', recipient);
          return false;
        }
        return recipient.components.some(
          (component) =>
            component.type === "button" && component.sub_type === "order_details",
        );
      });

      console.groupCollapsed("[dispatch-debug] payload /templates/send");
      console.log("templateId", templateId);
      console.log("account", account);
      console.log("recipientsCount", to.length);
      console.log("orderDetailsRecipientsCount", orderDetailsRecipients.length);
      console.log("payload", JSON.parse(JSON.stringify(payload)));
      if (orderDetailsRecipients.length) {
        console.log(
          "orderDetailsRecipients",
          JSON.parse(JSON.stringify(orderDetailsRecipients)),
        );
      }
      console.groupEnd();

      const response = await Api.post<{ batchId: string; queued: number; skipped: number }>(
        "/templates/send",
        payload,
      );
      const result = response.data;
      setActiveBatchId(result.batchId);
      if (result.skipped > 0) {
        toast.warning(
          `${result.skipped} destinatario(s) ja receberam mensagem hoje e foram ignorados.`,
        );
      }
      toast.success("Disparo efetuado!");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao enviar mensagens"));
    }
  }, [account]);

  const sendTemplate = useCallback(
    async (extraLeads?: Lead[]) => {
      if (isSubmitting) return;
      if (!selectedTemplate) return;
      if (!isTemplateApproved(selectedTemplate.meta_status)) {
        toast.warning(
          `O template ${selectedTemplate.name} ainda nao pode ser usado. Status atual: ${getTemplateStatusLabel(selectedTemplate.meta_status)}.`,
        );
        return;
      }

      // Always recompute fresh so AppStorage values set just before dispatch
      // (e.g. attendant name confirmed in modal) are picked up correctly.
      // selectedClientes already has PIX codes merged by handleOpenDispatchPreview.
      const source =
        modoPage === "leads" && Array.isArray(extraLeads) && extraLeads.length > 0
          ? [...selectedLeads, ...extraLeads]
          : modoPage === "clientes"
            ? selectedClientes
            : selectedLeads;

      const freshMappedVars = mapRecipientsToTemplateVars(source, selectedTemplate, {
        filterByTemplateVars: false,
      });

      // Build all components (body params + ORDER_DETAILS button with PIX) in the frontend.
      const recipients = buildTemplateRecipients(selectedTemplate, freshMappedVars);

      if (!recipients.length) {
        toast.warning('Nenhum destinatario valido encontrado para envio. Verifique se os dados de fatura e PIX estao disponiveis.');
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
