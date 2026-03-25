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
            component.type === "BUTTON" && component.sub_type === "ORDER_DETAILS",
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

      const response = await Api.post<{ batchId: string; queued: number }>(
        "/templates/send",
        payload,
      );
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

      console.log("[sendTemplate debug]", {
        sourceCount: source.length,
        freshMappedVarsCount: freshMappedVars.length,
        recipientsCount: recipients.length,
        firstMappedVar: freshMappedVars[0]
          ? {
              whatsapp: freshMappedVars[0].whatsapp,
              code_pix: freshMappedVars[0].code_pix,
              valor_fatura: freshMappedVars[0].valor_fatura,
              order_reference_id: freshMappedVars[0].order_reference_id,
              numero_contrato: freshMappedVars[0].numero_contrato,
            }
          : null,
      });

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
