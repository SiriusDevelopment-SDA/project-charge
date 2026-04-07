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
import {
  areOnlyAttendantFieldsMissing,
  getMissingTemplateVariables,
  getIncompleteTemplateRecipients,
  templateRequiresAttendantName,
} from "../../../validators/template.validator";
import { AppStorage } from "../../../services/storage/storage.service";
import { validarSelecaoCliente } from "../../../utils/validation";
import { getErrorMessage } from "../../../utils/error";
import { getTemplateStatusLabel, isTemplateApproved } from "../../../utils/templateStatus";
import { templateRequiresInvoiceData } from "../../../utils/templateRequirements";
import { useDispatchTemplate } from "../../useDispatchTemplate";

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

const INVOICE_DEPENDENT_FIELDS = new Set([
  "data_vencimento_fatura",
  "numero_contrato",
  "valor_fatura",
  "linha_digitavel_boleto",
  "link_boleto_pdf",
  "code_pix",
  "codigo_qr",
  "codigo_qr_code",
  "codigo_pix",
  "order_reference_id",
]);

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

function getClientIdentity(client: Cliente) {
  return String(client.id ?? client.cnpj_cpf ?? "").trim();
}

export function useCampaignFormController() {
  const dispatch = useDispatchTemplate();
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
  const [monthlyDayOfMonth, setMonthlyDayOfMonthState] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fetchInvoices } = useClient();
  const fetchInvoicesRef = useRef(fetchInvoices);
  fetchInvoicesRef.current = fetchInvoices;
  const hydratedFromDispatchRef = useRef(false);

  useEffect(() => {
    if (hydratedFromDispatchRef.current) return;
    if (!dispatch.selectedClientes.length) return;

    setSelectedClientsState(dispatch.selectedClientes);
    hydratedFromDispatchRef.current = true;
  }, [dispatch.selectedClientes]);

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
    setTemplateMapsVars([]);
  }, []);

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDates = dates.filter((d) => {
      const normalized = new Date(d);
      normalized.setHours(0, 0, 0, 0);
      return normalized >= today;
    });
    setSelectedDaysState(getUniqueSortedSelectedDays(futureDates));
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
    setSelectedDaysState([]);
    setDateRangeState(undefined);
    resetInvoiceRuleConsultation();
  }, [resetInvoiceRuleConsultation]);

  const setInvoiceRuleDaysFrom = useCallback((value: string) => {
    setInvoiceRuleDaysFromState(value);
    setSelectedDaysState([]);
    setDateRangeState(undefined);
    resetInvoiceRuleConsultation();
  }, [resetInvoiceRuleConsultation]);

  const setInvoiceRuleDaysTo = useCallback((value: string) => {
    setInvoiceRuleDaysToState(value);
    setSelectedDaysState([]);
    setDateRangeState(undefined);
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
        fetchedClients.map((client) => [getClientIdentity(client), client]),
      );

      return baseClients.map(
        (client) => fetchedById.get(getClientIdentity(client)) ?? client,
      );
    },
    [],
  );

  const clientNeedsTemplateInvoiceHydration = useCallback(
    (client: Cliente, template: Template) => {
      if (!templateRequiresInvoiceData(template)) {
        return false;
      }

      // Sem faturas carregadas → invoice_id ficará null no snapshot; sempre hidratar.
      if (!client.invoices?.list?.length) {
        return true;
      }

      const missingFields = getMissingTemplateVariables(template, client);
      return missingFields.some((fieldKey) =>
        INVOICE_DEPENDENT_FIELDS.has(fieldKey),
      );
    },
    [],
  );

  const hydrateSelectedClientsForTemplate = useCallback(
    async (template: Template, clients: Cliente[]) => {
      if (!templateRequiresInvoiceData(template) || !clients.length) {
        return clients;
      }

      const clientsToHydrate = clients.filter((client) =>
        clientNeedsTemplateInvoiceHydration(client, template),
      );

      if (!clientsToHydrate.length) {
        return clients;
      }

      const fetchedClients = await fetchInvoicesRef.current(clientsToHydrate);
      return mergeFetchedInvoices(clients, fetchedClients);
    },
    [clientNeedsTemplateInvoiceHydration, mergeFetchedInvoices],
  );

  const buildMappedVarsFromInvoiceRuleSelections = useCallback(
    (template: Template, filterByTemplateVars: boolean, overrideClientsByDate?: InvoiceRuleClientsByDate) => {
      const source = overrideClientsByDate ?? invoiceRuleClientsByDate;
      return Object.entries(source).flatMap(
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
    setMonthlyDayOfMonthState(null);
    resetInvoiceRuleConsultation();
  }, [resetInvoiceRuleConsultation]);

  useEffect(() => {
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

    const validClients = selectedClients.filter((client) =>
      validarSelecaoCliente(client, selectedTemplate),
    );

    setTemplateMapsVars(
      mapRecipientsToTemplateVars(validClients, selectedTemplate, {
        filterByTemplateVars: true,
      }),
    );
  }, [
    buildMappedVarsFromInvoiceRuleSelections,
    invoiceRuleClientsByDate,
    recurringType,
    selectedClients,
    selectedTemplate,
  ]);

  const setMonthlyDayOfMonth = useCallback((day: number | null) => {
    const clamped = day === null ? null : Math.min(28, Math.max(1, day));
    setMonthlyDayOfMonthState(clamped);
    resetInvoiceRuleConsultation();
  }, [resetInvoiceRuleConsultation]);

  const getRecurringDays = useCallback((): string[] => {
    return selectedDays.map((date) => toCalendarDateKey(date));
  }, [selectedDays]);

  const getMonthlyDateRange = useCallback(() => {
    if (!selectedDays.length) return undefined;
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

      if (!isTemplateApproved(selectedTemplate.meta_status)) {
        toast.warning(
          `O template ${selectedTemplate.name} ainda nao pode ser usado. Status atual: ${getTemplateStatusLabel(selectedTemplate.meta_status)}.`,
        );
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
      } else if (templateRequiresInvoiceData(selectedTemplate)) {
        source = await hydrateSelectedClientsForTemplate(
          selectedTemplate,
          selectedClients,
        );

        if (source !== selectedClients) {
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
        .map((item) => ({
          clientId: String(item.clientId ?? "").trim(),
          dispatchDate: item.dispatchDate,
          cnpj_cpf: String(item.cnpj_cpf ?? "").trim(),
          whatsapp: String(item.whatsapp ?? "").trim(),
          invoice_id: item.invoice_id ? String(item.invoice_id).trim() : undefined,
          nome_cliente: item.nome_cliente,
          nome_atendente: item.nome_atendente || attendantName || "",
          data_vencimento_fatura: item.data_vencimento_fatura,
          nome_empresa: item.nome_empresa,
          numero_contrato: item.numero_contrato,
          valor_fatura: item.valor_fatura,
          mensagem: item.mensagem,
          order_reference_id: item.order_reference_id,
          order_item_name: item.order_item_name,
          order_item_description: item.order_item_description,
          order_pix_merchant_name: item.order_pix_merchant_name,
          order_pix_key: item.order_pix_key,
          order_pix_key_type: item.order_pix_key_type,
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
    getMonthlyDateRange,
    getRecurringDays,
    hydrateSelectedClientsForTemplate,
    isSubmitting,
    name,
    recurringType,
    resetForm,
    selectedCategory,
    selectedClients,
    selectedDays,
    selectedTemplate,
    toCampaignDateIso,
  ]);

  const validateForm = useCallback(async (): Promise<ValidationResult> => {
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

    if (selectedTemplate && !isTemplateApproved(selectedTemplate.meta_status)) {
      return {
        success: false,
        error: {
          issues: [
            {
              message: `O template ${selectedTemplate.name} ainda nao pode ser usado. Status atual: ${getTemplateStatusLabel(selectedTemplate.meta_status)}.`,
            },
          ],
        },
      };
    }

    const recurringDays =
      recurringType === "monthly_days" ? getRecurringDays() : undefined;

    const monthlyDateRange = getMonthlyDateRange();

    const startDateForValidation =
      recurringType === "monthly_days" ? monthlyDateRange?.start : dateRange?.from;

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

    let effectiveMapVars: mappedVars[] = [];

    if (selectedTemplate) {
      if (usesInvoiceRule) {
        effectiveMapVars = buildMappedVarsFromInvoiceRuleSelections(
          selectedTemplate,
          false,
        );
      } else {
        effectiveMapVars = mapRecipientsToTemplateVars(
          selectedClients,
          selectedTemplate,
          { filterByTemplateVars: false },
        );
      }
    }

    if (!selectedTemplate || !effectiveMapVars.length) {
      return {
        success: false,
        error: {
          issues: [{ message: "Nenhum cliente valido para envio." }],
        },
      };
    }

    // Campos de invoice/PIX (INVOICE_DEPENDENT_FIELDS) sao preenchidos pelo backend
    // no momento do disparo — nunca devem bloquear a criacao da campanha.
    // Isso se aplica tanto ao modo single quanto ao modo recorrente (usesInvoiceRule).
    const incompleteRecipients = getIncompleteTemplateRecipients(
      selectedTemplate,
      effectiveMapVars,
    ).map((r) => ({
      ...r,
      missingFields: r.missingFields.filter((f) => !INVOICE_DEPENDENT_FIELDS.has(f)),
    })).filter((r) => r.missingNumber || r.missingFields.length > 0);


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

      incompleteRecipients.forEach((r) => {
        const clientName =
          effectiveMapVars[r.index]?.nome_cliente ||
          selectedClients[r.index]?.name ||
          `Cliente ${r.index + 1}`;
        toast.warning(
          `Cliente "${clientName}" retirado da campanha. Campos ausentes: ${r.missingFields.join(", ")}.`,
        );
      });

      const incompleteIndexes = new Set(incompleteRecipients.map((r) => r.index));
      effectiveMapVars = effectiveMapVars.filter((_, i) => !incompleteIndexes.has(i));

      if (!effectiveMapVars.length) {
        return {
          success: false,
          error: {
            issues: [{ message: "Nenhum cliente valido para envio apos remover pendencias." }],
          },
        };
      }
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
  ]);

  const handleSubmit = useCallback(
    async (
      setOpenModal: (value: boolean) => void,
      onRequireAttendantModal?: () => void,
    ) => {
      const result = await validateForm();

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
      monthlyDayOfMonth,
      setMonthlyDayOfMonth,
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
      monthlyDayOfMonth,
      name,
      recurringType,
      resetForm,
      selectedCategory,
      selectedClients,
      selectedDays,
      setInvoiceRuleDaysFrom,
      setInvoiceRuleDaysTo,
      setInvoiceRuleOperator,
      setMonthlyDayOfMonth,
      setSelectedTemplate,
      setSelectedDays,
      setSelectedClientsFromInvoiceRule,
      selectedTemplate,
      templateMapVars,
      validateForm,
    ],
  );
}
