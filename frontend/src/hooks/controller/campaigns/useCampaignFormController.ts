import { useCallback, useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "react-toastify";
import { campaignSchema } from "../../../schemas/campaign.schema";
import type { Category, Cliente, mappedVars, Template } from "../../../types";
import { CampaignService } from "../../../services/campaign/campaign.service";
import { useClient } from "../../useCliente";
import { mapRecipientsToTemplateVars } from "../../../mappers/templateVars.mapper";
import {
  areOnlyAttendantFieldsMissing,
  getIncompleteTemplateRecipients,
  templateRequiresAttendantName,
} from "../../../validators/template.validator";
import { AppStorage } from "../../../services/storage/storage.service";
import { validarSelecaoCliente } from "../../../utils/validation";
import { getErrorMessage } from "../../../utils/error";

type ValidationResult =
  | { success: true }
  | {
      success: false;
      error: {
        issues: { message: string }[];
        code?: "ATTENDANT_MODAL_REQUIRED";
      };
    };

type CampaignCreateWarning = {
  doc?: string;
};

type CampaignCreateResponse = {
  campaign: {
    name: string;
  };
  warnings?: CampaignCreateWarning[];
};

export function useCampaignFormController() {
  const [selectedClients, setSelectedClients] = useState<Cliente[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>();
  const [templateMapVars, setTemplateMapsVars] = useState<mappedVars[]>([]);
  const [name, setName] = useState("");
  const [dispatchTime, setdispatchTime] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [recurring, setRecurring] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fetchInvoices } = useClient();

  const toCampaignDateIso = useCallback((date: Date) => {
    const safeDate = new Date(date);
    safeDate.setHours(12, 0, 0, 0);
    return safeDate.toISOString();
  }, []);

  const resetForm = useCallback(() => {
    setName("");
    setdispatchTime("");
    setSelectedTemplate(undefined);
    setSelectedCategory(undefined);
    setDateRange(undefined);
    setRecurring(false);
    setSelectedClients([]);
    setTemplateMapsVars([]);
  }, []);

  useEffect(() => {
    const mapVars = async () => {
      try {
        if (!selectedTemplate || selectedClients.length === 0) {
          setTemplateMapsVars([]);
          return;
        }

        let source = selectedClients;

        if (selectedTemplate.category.toLowerCase().includes("cobr")) {
          const hasPendingInvoices = selectedClients.some(
            (client) => client.invoices?.status !== "success",
          );

          if (hasPendingInvoices) {
            const needInvoices = selectedClients.filter(
              (client) => !client.invoices || client.invoices.status === "error",
            );

            source = await fetchInvoices(needInvoices);
          }
        }

        const validClients = source.filter((client) =>
          validarSelecaoCliente(client, selectedTemplate),
        );

        if (validClients.length !== source.length) {
          const sourceIds = source.map((client) => client.id).sort().join(",");
          const validIds = validClients.map((client) => client.id).sort().join(",");

          if (sourceIds !== validIds) {
            setSelectedClients(validClients);
            return;
          }
        }

        const mapped = mapRecipientsToTemplateVars(validClients, selectedTemplate, {
          filterByTemplateVars: true,
        });

        setTemplateMapsVars(mapped);
      } catch {
        setSelectedTemplate(undefined);
        toast.error("Este template nao pode ser utilizado, contate o suporte.");
        setTemplateMapsVars([]);
      }
    };

    void mapVars();
  }, [selectedTemplate, selectedClients, fetchInvoices]);

  const createCampaign = useCallback(async (): Promise<{ success: boolean }> => {
    if (isSubmitting) return { success: false };

    try {
      setIsSubmitting(true);

      if (!selectedClients.length || !dateRange?.from || !selectedTemplate || !selectedCategory) {
        return { success: false };
      }

      const attendantName = AppStorage.getAttendantName();
      const requiresAttendant = templateRequiresAttendantName(selectedTemplate);
      if (requiresAttendant && !attendantName) {
        toast.warning("Informe o nome do atendente para usar este template.");
        return { success: false };
      }

      let source = selectedClients;

      if (selectedTemplate.category.toLowerCase().includes("cobr")) {
        const needInvoices = selectedClients.filter(
          (client) => !client.invoices || client.invoices.status === "error",
        );

        if (needInvoices.length) {
          source = await fetchInvoices(needInvoices);
          setSelectedClients(source);
        }
      }

      const mappedVarsForSubmit = mapRecipientsToTemplateVars(source, selectedTemplate, {
        filterByTemplateVars: true,
      }) as Array<Record<string, unknown>>;

      const templateMapVarsForSubmit = mappedVarsForSubmit
        .map((item) => ({
          clientId: String(item.clientId ?? "").trim(),
          cnpj_cpf: String(item.cnpj_cpf ?? "").trim(),
          whatsapp: String(item.whatsapp ?? "").trim(),
          nome_cliente: item.nome_cliente,
          nome_atendente: item.nome_atendente || attendantName || "",
          data_vencimento_fatura: item.data_vencimento_fatura,
          nome_empresa: item.nome_empresa,
          numero_contrato: item.numero_contrato,
          valor_fatura: item.valor_fatura,
          code_pix: item.code_pix,
          linha_digitavel_boleto: item.linha_digitavel_boleto,
          link_boleto_pdf: item.link_boleto_pdf,
          mensagem: item.mensagem,
        }))
        .filter(
          (item) =>
            item.clientId.length > 0 &&
            item.cnpj_cpf.length > 0 &&
            item.whatsapp.length > 0,
        );

      if (!templateMapVarsForSubmit.length) {
        toast.error("Nenhum cliente valido para campanha apos validacao do template.");
        return { success: false };
      }

      const payload = {
        name,
        company: selectedTemplate.company.id,
        templateId: selectedTemplate.id,
        categoryId: selectedCategory.id,
        startDate: toCampaignDateIso(dateRange.from),
        endDate: toCampaignDateIso(dateRange.to ?? dateRange.from),
        dispatchTime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        recurring,
        clients: templateMapVarsForSubmit.map((item) => item.clientId),
        templateMapVars: templateMapVarsForSubmit,
      };

      const response = await CampaignService.createCampaignRequest(payload);
      const { status, data } = response;
      const createData = data as CampaignCreateResponse;

      if (status === 201) {
        const [hour, minute] = dispatchTime.split(":").map(Number);
        const dispatchDate = new Date(payload.startDate);
        dispatchDate.setHours(hour, minute, 0, 0);

        const now = new Date();
        const message =
          dispatchDate > now
            ? `Campanha ${createData.campaign.name} criada e encaminhada para a fila de disparo!`
            : `Campanha ${createData.campaign.name} criada com sucesso!`;

        const warnings = Array.isArray(createData.warnings) ? createData.warnings : [];
        warnings.forEach((item) => {
          toast.info(
            `O cliente de documento:${item.doc} foi retirado da campanha pois nao foram mapeadas todas as variaveis obrigatorias!`,
          );
        });

        toast.success(message);
        resetForm();
        return { success: true };
      }

      return { success: false };
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao criar campanha."));
      return { success: false };
    } finally {
      setIsSubmitting(false);
    }
  }, [
    dateRange,
    dispatchTime,
    fetchInvoices,
    isSubmitting,
    name,
    recurring,
    resetForm,
    selectedCategory,
    selectedClients,
    selectedTemplate,
    toCampaignDateIso,
  ]);

  const validateForm = useCallback((): ValidationResult => {
    if (!selectedClients.length) {
      return {
        success: false,
        error: { issues: [{ message: "Selecione ao menos um cliente" }] },
      };
    }

    const parsed = campaignSchema.safeParse({
      name: name ?? "",
      templateId: selectedTemplate?.id ?? "",
      categoryId: selectedCategory?.id ?? "",
      startDate: dateRange?.from,
      endDate: recurring ? dateRange?.to : dateRange?.from,
      dispatchTime: dispatchTime ?? "",
      clientIds: selectedClients.map((client) => client.id),
      recurring,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: {
          issues: [{ message: parsed.error.issues[0]?.message ?? "Erro de validacao" }],
        },
      };
    }

    const effectiveMapVars =
      templateMapVars.length && selectedTemplate
        ? templateMapVars
        : selectedTemplate
          ? mapRecipientsToTemplateVars(selectedClients, selectedTemplate, {
              filterByTemplateVars: true,
            })
          : [];

    if (!selectedTemplate || !effectiveMapVars.length) {
      return {
        success: false,
        error: {
          issues: [{ message: "Nenhum cliente valido para envio." }],
        },
      };
    }

    const incompleteRecipients = getIncompleteTemplateRecipients(
      selectedTemplate,
      effectiveMapVars,
    );

    if (incompleteRecipients.length) {
      if (
        AppStorage.getAuthMode() === "embed" &&
        areOnlyAttendantFieldsMissing(incompleteRecipients)
      ) {
        return {
          success: false,
          error: {
            code: "ATTENDANT_MODAL_REQUIRED",
            issues: [{ message: "Informe o nome do atendente para continuar." }],
          },
        };
      }

      if (areOnlyAttendantFieldsMissing(incompleteRecipients)) {
        return {
          success: false,
          error: {
            issues: [{ message: "Nao foi possivel identificar o nome do usuario logado." }],
          },
        };
      }

      const invalidNames = incompleteRecipients
        .slice(0, 3)
        .map((recipient) => selectedClients[recipient.index]?.name || `Cliente ${recipient.index + 1}`);

      return {
        success: false,
        error: {
          issues: [
            {
              message:
                `Preencha todas as variaveis obrigatorias antes do preview. ` +
                `Pendencias encontradas em ${incompleteRecipients.length} cliente(s): ${invalidNames.join(", ")}.`,
            },
          ],
        },
      };
    }

    setTemplateMapsVars(effectiveMapVars);

    return { success: true };
  }, [
    dateRange,
    dispatchTime,
    name,
    recurring,
    selectedCategory,
    selectedClients,
    selectedTemplate,
    templateMapVars,
  ]);

  const handleSubmit = useCallback(
    (
      setOpenModal: (value: boolean) => void,
      onRequireAttendantModal?: () => void,
    ) => {
      const result = validateForm();

      if (!result.success) {
        if (result.error.code === "ATTENDANT_MODAL_REQUIRED") {
          onRequireAttendantModal?.();
          return;
        }

        toast.error(result.error.issues[0]?.message);
        return;
      }

      setOpenModal(true);
    },
    [validateForm],
  );

  return useMemo(
    () => ({
      name,
      setName,
      dispatchTime,
      setdispatchTime,
      selectedTemplate,
      setSelectedTemplate,
      selectedCategory,
      setSelectedCategory,
      dateRange,
      setDateRange,
      recurring,
      setRecurring,
      isSubmitting,
      templateMapVars,
      createCampaign,
      resetForm,
      selectedClients,
      setSelectedClients,
      handleSubmit,
      validateForm,
    }),
    [
      createCampaign,
      dateRange,
      dispatchTime,
      handleSubmit,
      isSubmitting,
      name,
      recurring,
      resetForm,
      selectedCategory,
      selectedClients,
      selectedTemplate,
      templateMapVars,
      validateForm,
    ],
  );
}
