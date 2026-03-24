import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "react-toastify";
import { campaignSchema } from "../../../schemas/campaign.schema";
import type {
  Category,
  Cliente,
  InvoiceRuleClientsByDate,
  mappedVars,
  Template,
} from "../../../types";
import type { RecurringType } from "../../../types/champaignApiTypes";
import type { InvoiceRuleOperator } from "../../../types/invoiceApiTypes";
import { CampaignService } from "../../../services/campaign/campaign.service";
import { useClient } from "../../useCliente";
import { mapRecipientsToTemplateVars } from "../../../mappers/templateVars.mapper";
import { buildTemplateRecipient } from "../../../mappers/templateRecipient.builder";
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

function normalizeSelectedCalendarDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  return normalized;
}

function toCalendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUniqueSortedSelectedDays(dates: Date[]): Date[] {
  const uniqueDates = new Map<string, Date>();

  dates.forEach((date) => {
    const normalized = normalizeSelectedCalendarDate(date);
    uniqueDates.set(toCalendarDateKey(normalized), normalized);
  });

  return [...uniqueDates.values()].sort((a, b) => a.getTime() - b.getTime());
}

function getUniqueClientsFromInvoiceRuleSelections(
  selections: InvoiceRuleClientsByDate,
): Cliente[] {
  return [...new Map(
    Object.values(selections)
      .flat()
      .map((client) => [client.id, client]),
  ).values()];
}

export function useCampaignFormController() {
  const [selectedClients, setSelectedClientsState] = useState<Cliente[]>([]);
  const [selectedTemplate, setSelectedTemplateState] = useState<Template>();
  const [templateMapVars, setTemplateMapsVars] = useState<mappedVars[]>([]);
  const [name, setName] = useState("");
  const [dispatchTime, setdispatchTime] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>();
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>(undefined);
  const [recurringType, setRecurringType] = useState<RecurringType>("single");
  const [selectedDays, setSelectedDaysState] = useState<Date[]>([]);
  const [invoiceRuleClientsByDate, setInvoiceRuleClientsByDate] =
    useState<InvoiceRuleClientsByDate>({});
  const [invoiceRuleOperatorState, setInvoiceRuleOperatorState] =
    useState<InvoiceRuleOperator>("less_than");
  const [invoiceRuleDaysFromState, setInvoiceRuleDaysFromState] = useState("0");
  const [invoiceRuleDaysToState, setInvoiceRuleDaysToState] = useState("30");
  const [hasConsultedInvoiceRule, setHasConsultedInvoiceRule] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fetchInvoices } = useClient();
  const fetchInvoicesRef = useRef(fetchInvoices);
  fetchInvoicesRef.current = fetchInvoices;

  const resetInvoiceRuleConsultation = useCallback(() => {
    setInvoiceRuleClientsByDate({});
    setSelectedClientsState([]);
    setTemplateMapsVars([]);
    setHasConsultedInvoiceRule(false);
  }, []);

  const setSelectedClients = useCallback((clients: Cliente[]) => {
    setInvoiceRuleClientsByDate({});
    setSelectedClientsState(clients);
    setHasConsultedInvoiceRule(false);
  }, []);

  const setSelectedTemplate = useCallback((template?: Template) => {
    setSelectedTemplateState(template);

    if (recurringType !== "single") {
      resetInvoiceRuleConsultation();
    }
  }, [recurringType, resetInvoiceRuleConsultation]);

  const setSelectedClientsFromInvoiceRule = useCallback(
    (clientsByDate: InvoiceRuleClientsByDate) => {
      setInvoiceRuleClientsByDate(clientsByDate);
      setSelectedClientsState(
        getUniqueClientsFromInvoiceRuleSelections(clientsByDate),
      );
      setHasConsultedInvoiceRule(true);
    },
    [],
  );

  const setSelectedDays = useCallback((dates: Date[]) => {
    setSelectedDaysState(getUniqueSortedSelectedDays(dates).slice(0, 1));
    resetInvoiceRuleConsultation();
  }, [resetInvoiceRuleConsultation]);

  const setDateRange = useCallback((value: DateRange | undefined) => {
    setDateRangeState(value);

    if (recurringType === "range") {
      resetInvoiceRuleConsultation();
    }
  }, [recurringType, resetInvoiceRuleConsultation]);

  const setInvoiceRuleOperator = useCallback((value: InvoiceRuleOperator) => {
    setInvoiceRuleOperatorState(value);
    resetInvoiceRuleConsultation();
  }, [resetInvoiceRuleConsultation]);

  const setInvoiceRuleDaysFrom = useCallback((value: string) => {
    setInvoiceRuleDaysFromState(value);
    resetInvoiceRuleConsultation();
  }, [resetInvoiceRuleConsultation]);

  const setInvoiceRuleDaysTo = useCallback((value: string) => {
    setInvoiceRuleDaysToState(value);
    resetInvoiceRuleConsultation();
  }, [resetInvoiceRuleConsultation]);

  const toCampaignDateIso = useCallback((date: Date) => {
    const safeDate = new Date(date);
    safeDate.setHours(12, 0, 0, 0);
    return safeDate.toISOString();
  }, []);

  const mergeFetchedInvoices = useCallback(
    (baseClients: Cliente[], fetchedClients: Cliente[]) => {
      const fetchedById = new Map(
        fetchedClients.map((client) => [client.id, client]),
      );

      return baseClients.map((client) => fetchedById.get(client.id) ?? client);
    },
    [],
  );

  const buildMappedVarsFromInvoiceRuleSelections = useCallback(
    (template: Template, filterByTemplateVars: boolean) => {
      return Object.entries(invoiceRuleClientsByDate).flatMap(
        ([dispatchDate, clients]) => {
          const validClients = clients.filter((client) =>
            validarSelecaoCliente(client, template),
          );

          return mapRecipientsToTemplateVars(validClients, template, {
            filterByTemplateVars,
          }).map((item) => ({
            ...item,
            dispatchDate,
          }));
        },
      );
    },
    [invoiceRuleClientsByDate],
  );

  const resetForm = useCallback(() => {
    setName("");
    setdispatchTime("");
    setSelectedTemplateState(undefined);
    setSelectedCategory(undefined);
    setDateRangeState(undefined);
    setRecurringType("single");
    setSelectedDaysState([]);
    setInvoiceRuleOperatorState("less_than");
    setInvoiceRuleDaysFromState("0");
    setInvoiceRuleDaysToState("30");
    resetInvoiceRuleConsultation();
  }, [resetInvoiceRuleConsultation]);

  useEffect(() => {
    const mapVars = async () => {
      try {
        if (!selectedTemplate || selectedClients.length === 0) {
          setTemplateMapsVars([]);
          return;
        }

        if (recurringType !== "single" && Object.keys(invoiceRuleClientsByDate).length) {
          setTemplateMapsVars(
            buildMappedVarsFromInvoiceRuleSelections(selectedTemplate, true),
          );
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

            const fetchedClients = await fetchInvoicesRef.current(needInvoices);
            source = mergeFetchedInvoices(selectedClients, fetchedClients);
          }
        }

        const validClients = source.filter((client) =>
          validarSelecaoCliente(client, selectedTemplate),
        );

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
  }, [
    buildMappedVarsFromInvoiceRuleSelections,
    invoiceRuleClientsByDate,
    mergeFetchedInvoices,
    recurringType,
    selectedClients,
    selectedTemplate,
  ]);

  const getRecurringDays = useCallback((): string[] => {
    return selectedDays.map((date) => toCalendarDateKey(date));
  }, [selectedDays]);

  const getMonthlyDateRange = useCallback(() => {
    if (!selectedDays.length) {
      return undefined;
    }

    return {
      start: selectedDays[0],
      end: selectedDays[selectedDays.length - 1],
    };
  }, [selectedDays]);

  const createCampaign = useCallback(async (): Promise<{ success: boolean }> => {
    if (isSubmitting) return { success: false };

    try {
      setIsSubmitting(true);

      if (!selectedClients.length || !selectedTemplate || !selectedCategory) {
        return { success: false };
      }

      if (recurringType === "monthly_days" && !selectedDays.length) {
        return { success: false };
      }

      if (recurringType !== "monthly_days" && !dateRange?.from) {
        return { success: false };
      }

      const attendantName = AppStorage.getAttendantName();
      const requiresAttendant = templateRequiresAttendantName(selectedTemplate);
      if (requiresAttendant && !attendantName) {
        toast.warning("Informe o nome do atendente para usar este template.");
        return { success: false };
      }

      const usesInvoiceRule = recurringType !== "single";

      let source = selectedClients;
      let mappedVarsForSubmit: mappedVars[] = [];

      if (usesInvoiceRule) {
        mappedVarsForSubmit = buildMappedVarsFromInvoiceRuleSelections(
          selectedTemplate,
          false,
        );
      } else if (selectedTemplate.category.toLowerCase().includes("cobr")) {
        const needInvoices = selectedClients.filter(
          (client) => !client.invoices || client.invoices.status === "error",
        );

        if (needInvoices.length) {
          const fetchedClients = await fetchInvoices(needInvoices);
          source = mergeFetchedInvoices(selectedClients, fetchedClients);
          setSelectedClientsState(source);
        }

        mappedVarsForSubmit = mapRecipientsToTemplateVars(source, selectedTemplate, {
          filterByTemplateVars: false,
        });
      } else {
        mappedVarsForSubmit = mapRecipientsToTemplateVars(source, selectedTemplate, {
          filterByTemplateVars: false,
        });
      }

      const templateMapVarsForSubmit = mappedVarsForSubmit
        .map((item) => {
          const recipient = buildTemplateRecipient(selectedTemplate, item);
          if (!recipient) return null;

          return {
            clientId: String(item.clientId ?? "").trim(),
            dispatchDate: item.dispatchDate,
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
            order_reference_id: item.order_reference_id,
            order_item_name: item.order_item_name,
            order_item_description: item.order_item_description,
            order_pix_merchant_name: item.order_pix_merchant_name,
            order_pix_key: item.order_pix_key,
            order_pix_key_type: item.order_pix_key_type,
            components: recipient.components,
          };
        })
        .filter(
          (item): item is NonNullable<typeof item> =>
            item !== null &&
            item.clientId.length > 0 &&
            item.cnpj_cpf.length > 0 &&
            item.whatsapp.length > 0,
        );

      if (!templateMapVarsForSubmit.length) {
        toast.error("Nenhum cliente valido para campanha apos validacao do template.");
        return { success: false };
      }

      const monthlyDateRange = getMonthlyDateRange();
      const startDate =
        recurringType === "monthly_days"
          ? toCampaignDateIso(monthlyDateRange!.start)
          : toCampaignDateIso(dateRange!.from!);

      const endDate =
        recurringType === "monthly_days"
          ? toCampaignDateIso(monthlyDateRange!.end)
          : toCampaignDateIso(dateRange!.to ?? dateRange!.from!);

      const payload = {
        name,
        company: selectedTemplate.company.id,
        templateId: selectedTemplate.id,
        categoryId: selectedCategory.id,
        startDate,
        endDate,
        dispatchTime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        recurring: recurringType !== "single",
        recurringType,
        recurringDays: recurringType === "monthly_days" ? getRecurringDays() : undefined,
        clients: [...new Set(templateMapVarsForSubmit.map((item) => item.clientId))],
        templateMapVars: templateMapVarsForSubmit,
      };

      const response = await CampaignService.createCampaignRequest(payload);
      const { status, data } = response;
      const createData = data as CampaignCreateResponse;

      if (status === 201) {
        const message =
          recurringType === "monthly_days"
            ? `Campanha ${createData.campaign.name} criada com sucesso!`
            : (() => {
                const [hour, minute] = dispatchTime.split(":").map(Number);
                const dispatchDate = new Date(payload.startDate);
                dispatchDate.setHours(hour, minute, 0, 0);
                return dispatchDate > new Date()
                  ? `Campanha ${createData.campaign.name} criada e encaminhada para a fila de disparo!`
                  : `Campanha ${createData.campaign.name} criada com sucesso!`;
              })();

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
    buildMappedVarsFromInvoiceRuleSelections,
    dateRange,
    dispatchTime,
    fetchInvoices,
    getMonthlyDateRange,
    getRecurringDays,
    isSubmitting,
    mergeFetchedInvoices,
    name,
    recurringType,
    resetForm,
    selectedCategory,
    selectedClients,
    selectedDays,
    selectedTemplate,
    toCampaignDateIso,
  ]);

  const validateForm = useCallback((): ValidationResult => {
    const usesInvoiceRule = recurringType !== "single";

    if (usesInvoiceRule && !hasConsultedInvoiceRule) {
      return {
        success: false,
        error: {
          issues: [{ message: "Consulte as faturas pela regua de cobranca antes de continuar." }],
        },
      };
    }

    if (!selectedClients.length) {
      return {
        success: false,
        error: {
          issues: [
            {
              message:
                usesInvoiceRule
                  ? "Nenhum cliente foi encontrado para a regua de cobranca informada."
                  : "Selecione ao menos um cliente",
            },
          ],
        },
      };
    }

    const recurringDays =
      recurringType === "monthly_days" ? getRecurringDays() : undefined;

    const monthlyDateRange = getMonthlyDateRange();

    const startDateForValidation =
      recurringType === "monthly_days"
        ? monthlyDateRange?.start
        : dateRange?.from;

    const endDateForValidation =
      recurringType === "monthly_days"
        ? monthlyDateRange?.end
        : recurringType === "range"
          ? dateRange?.to
          : dateRange?.from;

    const parsed = campaignSchema.safeParse({
      name: name ?? "",
      templateId: selectedTemplate?.id ?? "",
      categoryId: selectedCategory?.id ?? "",
      recurringType,
      startDate: startDateForValidation,
      endDate: endDateForValidation,
      recurringDays,
      dispatchTime: dispatchTime ?? "",
      clientIds: selectedClients.map((client) => client.id),
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
      usesInvoiceRule && selectedTemplate
        ? buildMappedVarsFromInvoiceRuleSelections(selectedTemplate, true)
        : templateMapVars.length && selectedTemplate
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
        .map(
          (recipient) =>
            effectiveMapVars[recipient.index]?.nome_cliente ||
            selectedClients[recipient.index]?.name ||
            `Cliente ${recipient.index + 1}`,
        );

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
    buildMappedVarsFromInvoiceRuleSelections,
    getMonthlyDateRange,
    getRecurringDays,
    hasConsultedInvoiceRule,
    name,
    recurringType,
    selectedCategory,
    selectedClients,
    selectedDays,
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
      recurringType,
      setRecurringType,
      selectedDays,
      setSelectedDays,
      invoiceRuleOperator: invoiceRuleOperatorState,
      setInvoiceRuleOperator,
      invoiceRuleDaysFrom: invoiceRuleDaysFromState,
      setInvoiceRuleDaysFrom,
      invoiceRuleDaysTo: invoiceRuleDaysToState,
      setInvoiceRuleDaysTo,
      hasConsultedInvoiceRule,
      isSubmitting,
      templateMapVars,
      createCampaign,
      resetForm,
      selectedClients,
      setSelectedClients,
      setSelectedClientsFromInvoiceRule,
      handleSubmit,
      validateForm,
    }),
    [
      createCampaign,
      dateRange,
      dispatchTime,
      handleSubmit,
      hasConsultedInvoiceRule,
      invoiceRuleDaysFromState,
      invoiceRuleDaysToState,
      invoiceRuleOperatorState,
      isSubmitting,
      name,
      recurringType,
      resetForm,
      selectedCategory,
      selectedClients,
      selectedDays,
      setInvoiceRuleDaysFrom,
      setInvoiceRuleDaysTo,
      setInvoiceRuleOperator,
      setSelectedTemplate,
      setSelectedDays,
      setSelectedClientsFromInvoiceRule,
      selectedTemplate,
      templateMapVars,
      validateForm,
    ],
  );
}
