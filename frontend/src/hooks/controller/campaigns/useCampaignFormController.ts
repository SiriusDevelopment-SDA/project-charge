import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import type { DateRange } from "react-day-picker";
import { campaignSchema, mapVarsSchema } from "../../../schemas/campaign.schema";
import type { Category, Cliente, mappedVars, Template } from "../../../types";
import { CampaignService } from "../../../services/campaign/campaign.service";
import { ClientContext } from "../../../context/contextClients";
import { mapRecipientsToTemplateVars } from "../../../mappers/templateVars.mapper";
import {
  getStoredAttendantName,
  templateRequiresAttendantName,
} from "../../../mappers/templateVars.mapper";
import { validarSelecaoCliente } from "../../../utils/validation";
import { getErrorMessage } from "../../../utils/error";

type ValidationResult =
  | { success: true }
  | { success: false; error: { issues: { message: string }[] } };

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
  const { fetchInvoices } = useContext(ClientContext);

  const toCampaignDateIso = useCallback((date: Date) => {
    const safeDate = new Date(date);
    // Force noon to prevent day-shift issues caused by timezone conversions.
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
            (client) => client.invoices?.status !== "success"
          );

          if (hasPendingInvoices) {
            const needInvoices = selectedClients.filter(
              (client) => !client.invoices || client.invoices.status === "error"
            );

            source = await fetchInvoices(needInvoices);
          }
        }

        const validClients = source.filter((client) =>
          validarSelecaoCliente(client, selectedTemplate)
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
        toast.error("Este template não pode ser utilizado, contate o suporte.");
        setTemplateMapsVars([]);
      }
    };

    mapVars();
  }, [selectedTemplate, selectedClients, fetchInvoices]);

  const createCampaign = useCallback(async (): Promise<{ success: boolean }> => {
    if (isSubmitting) return { success: false };

    try {
      setIsSubmitting(true);

      if (!selectedClients.length || !dateRange?.from || !selectedTemplate || !selectedCategory) {
        return { success: false };
      }

       const attendantName = getStoredAttendantName();
       const requiresAttendant = templateRequiresAttendantName(selectedTemplate);
       if (requiresAttendant && !attendantName) {
         toast.warning("Informe o nome do atendente para usar este template.");
         return { success: false };
       }

      let source = selectedClients;

      if (selectedTemplate.category.toLowerCase().includes("cobr")) {
        const needInvoices = selectedClients.filter(
          (client) => !client.invoices || client.invoices.status === "error"
        );
        if (needInvoices.length) {
          source = await fetchInvoices(needInvoices);
          setSelectedClients(source);
        }
      }

      const mappedVarsForSubmit = mapRecipientsToTemplateVars(
        source,
        selectedTemplate,
        { filterByTemplateVars: true }
      ) as Array<Record<string, unknown>>;

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
            item.whatsapp.length > 0
        );

      if (!templateMapVarsForSubmit.length) {
        toast.error("Nenhum cliente válido para campanha após validação do template.");
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
            `O cliente de documento:${item.doc} foi retirado da campanha pois não foram mapeadas todas as variáveis obrigatórias!`
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
    name,
    selectedTemplate,
    selectedCategory,
    dateRange,
    dispatchTime,
    selectedClients,
    recurring,
    isSubmitting,
    resetForm,
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
        error: { issues: [{ message: parsed.error.issues[0]?.message ?? "Erro de validação" }] },
      };
    }

    const validMapVars: mappedVars[] = [];
    const validClients: Cliente[] = [];
    const removedClients: string[] = [];

    const effectiveMapVars =
      templateMapVars.length && selectedTemplate
        ? templateMapVars
        : selectedTemplate
        ? mapRecipientsToTemplateVars(selectedClients, selectedTemplate, {
            filterByTemplateVars: true,
          })
        : [];

    effectiveMapVars.forEach((mapVar) => {
      const result = mapVarsSchema.partial().safeParse(mapVar);
      const client = selectedClients.find(
        (current) =>
          current.cnpj_cpf.replace(/\D/g, "") ===
          (mapVar.cnpj_cpf ?? "").replace(/\D/g, "")
      );

      if (result.success) {
        validMapVars.push(mapVar);
        if (client) validClients.push(client);
        return;
      }

      if (client) removedClients.push(client.name);
    });

    if (removedClients.length) {
      toast.warning(
        `Clientes removidos por erro de mapeamento: ${removedClients.join(", ")} contate o suporte.`
      );
    }

    if (!validClients.length) {
      return {
        success: false,
        error: {
          issues: [{ message: "Nenhum cliente válido para envio, contate o suporte." }],
        },
      };
    }

    setSelectedClients(validClients);
    setTemplateMapsVars(validMapVars);

    return { success: true };
  }, [
    name,
    selectedTemplate,
    selectedCategory,
    dateRange,
    dispatchTime,
    selectedClients,
    templateMapVars,
    recurring,
  ]);

  const handleSubmit = useCallback(
    (setOpenModal: (value: boolean) => void) => {
      const result = validateForm();

      if (!result.success) {
        toast.error(result.error.issues[0]?.message);
        return;
      }

      setOpenModal(true);
    },
    [validateForm]
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
      createCampaign,
      resetForm,
      selectedClients,
      setSelectedClients,
      handleSubmit,
      validateForm,
    }),
    [
      name,
      dispatchTime,
      selectedTemplate,
      selectedCategory,
      dateRange,
      recurring,
      isSubmitting,
      createCampaign,
      resetForm,
      selectedClients,
      handleSubmit,
      validateForm,
    ]
  );
}
