import { useCallback, useEffect, useMemo, useState } from "react";
import type { SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import type { Category } from "../../../types";
import type {
  TemplateCreateButton,
  TemplateCreateComponent,
  TemplateCreateInput,
} from "../../../types/templateApiTypes";
import {
  getInvalidTemplateVariableLabels,
  getValidTemplateVariableNames,
} from "../../../utils/templateVariableTokens";
import {
  maskCurrencyInput,
  maskDateInput,
  normalizeCurrencyValue,
  normalizeDateValue,
} from "../../../utils/templateFieldFormat";
import {
  templateCreateSchema,
  type TemplateCreateFormValues,
} from "../../../schemas/template.schema";
import { buildNormalizedSearch } from "../../../utils/locationSearch";
import { useGlobalLoading } from "../../useGlobalLoading";
import { useCreateTemplateMutation } from "../../mutations/useTemplateMutations";
import { useCategoriesQuery } from "../../queries/useCampaignsQuery";

type SelectOption = {
  id: string;
  name: string;
};

type TemplateFieldErrors = {
  templateName?: string;
  categoryId?: string;
  body?: string;
  ctas?: string;
  sampleFields: Record<string, string>;
};

const ORDER_DETAILS_BUTTON_TEXT = "Copy Pix code";
const ORDER_DETAILS_BUTTON_LABEL = "Copiar código Pix";

const CTA_OPTIONS: SelectOption[] = [
  { id: "pay_now", name: "Pagar agora" },
  { id: "copy_code", name: ORDER_DETAILS_BUTTON_LABEL },
];

const VARIABLE_OPTIONS: SelectOption[] = [
  { id: "nome_cliente", name: "Nome do cliente" },
  { id: "nome_atendente", name: "Nome do atendente" },
  { id: "data_vencimento_fatura", name: "Data de vencimento" },
  { id: "numero_contrato", name: "Número do contrato" },
  { id: "valor_fatura", name: "Valor da fatura" },
  { id: "linha_digitavel_boleto", name: "Linha digitável (boleto)" },
  { id: "link_boleto_pdf", name: "Link do boleto (PDF)" },
  { id: "code_pix", name: "Código Pix" },
];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function mapCategoryToMetaCategory(
  categoryName: string,
): TemplateCreateInput["category"] {
  const normalizedCategory = normalizeText(categoryName);

  if (
    normalizedCategory.includes("marketing") ||
    normalizedCategory.includes("promoc") ||
    normalizedCategory.includes("oferta")
  ) {
    return "MARKETING";
  }

  if (
    normalizedCategory.includes("autentic") ||
    normalizedCategory.includes("otp") ||
    normalizedCategory.includes("token") ||
    normalizedCategory.includes("verific")
  ) {
    return "AUTHENTICATION";
  }

  return "UTILITY";
}

function buildCtaButton(): TemplateCreateButton {
  return {
    type: "ORDER_DETAILS",
    text: ORDER_DETAILS_BUTTON_TEXT,
  };
}

function toMetaIndexedBody(body: string, orderedVars: string[]) {
  return orderedVars.reduce((accumulator, variableName, index) => {
    return accumulator.replaceAll(`{{${variableName}}}`, `{{${index + 1}}}`);
  }, body);
}

function buildBodyExamples(
  orderedVars: string[],
  variablesMap: Record<string, string>,
) {
  return [
    orderedVars.map((variableName) => {
      const sampleValue = normalizeTemplateSampleValue(
        variableName,
        String(variablesMap[variableName] ?? ""),
      );
      return sampleValue || variableName;
    }),
  ];
}

function areSameOptionLists(left: SelectOption[], right: SelectOption[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item.id === right[index]?.id)
  );
}

function areSameVariablesMap(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

function toMetaTemplateName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function getRequiredCtaVariableNames(ctas: SelectOption[]) {
  const requiredVariables = new Set<string>();

  for (const cta of ctas) {
    if (cta.id === "pay_now") {
      requiredVariables.add("link_boleto_pdf");
    }

    if (cta.id === "copy_code") {
      requiredVariables.add("code_pix");
    }
  }

  return Array.from(requiredVariables);
}

function maskTemplateSampleValue(variableName: string, value: string) {
  if (variableName === "data_vencimento_fatura") {
    return maskDateInput(value);
  }

  if (variableName === "valor_fatura") {
    return maskCurrencyInput(value);
  }

  return value;
}

function normalizeTemplateSampleValue(variableName: string, value: string) {
  if (variableName === "data_vencimento_fatura") {
    return normalizeDateValue(value);
  }

  if (variableName === "valor_fatura") {
    return normalizeCurrencyValue(value);
  }

  return value.trim();
}

function formatTemplateSampleVariablesMap(
  values: Record<string, string>,
  mode: "mask" | "normalize",
) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      mode === "mask"
        ? maskTemplateSampleValue(key, String(value ?? ""))
        : normalizeTemplateSampleValue(key, String(value ?? "")),
    ]),
  );
}

function createEmptyFieldErrors(): TemplateFieldErrors {
  return {
    sampleFields: {},
  };
}

function getInvalidVariablesMessage(invalidVariables: string[]) {
  return invalidVariables.length === 1
    ? `A variavel ${invalidVariables[0]} nao existe ou esta mal formatada.`
    : `Corrija as variaveis invalidas: ${invalidVariables.join(", ")}.`;
}

function getFirstFieldErrorMessage(errors: TemplateFieldErrors) {
  return (
    errors.templateName ??
    errors.categoryId ??
    errors.body ??
    errors.ctas ??
    Object.values(errors.sampleFields)[0] ??
    ""
  );
}

function sanitizeTemplateFormValues(input: {
  templateName: string;
  categoryId: string;
  header: string;
  body: string;
  footer: string;
  ctaIds: SelectOption[];
  variablesMap: Record<string, string>;
}): TemplateCreateFormValues {
  return {
    templateName: String(input.templateName ?? ""),
    categoryId: String(input.categoryId ?? ""),
    header: String(input.header ?? ""),
    body: String(input.body ?? ""),
    footer: String(input.footer ?? ""),
    ctaIds: input.ctaIds.flatMap((cta) =>
      cta?.id === "pay_now" || cta?.id === "copy_code" ? [cta.id] : [],
    ),
    variablesMap: Object.fromEntries(
      Object.entries(input.variablesMap ?? {}).map(([key, value]) => [
        String(key),
        String(value ?? ""),
      ]),
    ),
  };
}

export function useCreateTemplatePageController() {
  const navigate = useNavigate();
  const location = useLocation();
  const normalizedSearch = buildNormalizedSearch(location.search);
  const { showLoading, hideLoading } = useGlobalLoading();
  const createTemplateMutation = useCreateTemplateMutation();
  const {
    data: categories = [],
    isLoading: isCategoriesLoading,
    isError: isCategoriesError,
  } = useCategoriesQuery();

  const [templateName, setTemplateNameState] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [ctaOpen, setCtaOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const [selectedCategory, setSelectedCategoryState] = useState<Category | null>(null);
  const [ctas, setCtasState] = useState<SelectOption[]>([]);
  const [varsSelected, setVarsSelected] = useState<SelectOption[]>([]);
  const [header, setHeaderState] = useState("");
  const [body, setBodyState] = useState("");
  const [footer, setFooterState] = useState("");
  const [variablesMap, setVariablesMapState] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<TemplateFieldErrors>(
    createEmptyFieldErrors(),
  );

  const categoryOptions = useMemo(
    () =>
      [...categories].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }),
      ),
    [categories],
  );

  const availableVariableNames = useMemo(
    () => VARIABLE_OPTIONS.map((option) => option.id),
    [],
  );

  const requiredCtaVariables = useMemo(
    () => getRequiredCtaVariableNames(ctas),
    [ctas],
  );

  const validBodyVariables = useMemo(
    () => getValidTemplateVariableNames(body, availableVariableNames),
    [availableVariableNames, body],
  );

  const invalidBodyVariables = useMemo(
    () => getInvalidTemplateVariableLabels(body, availableVariableNames),
    [availableVariableNames, body],
  );

  const clearSimpleFieldError = useCallback(
    (fieldName: Exclude<keyof TemplateFieldErrors, "sampleFields">) => {
      setFieldErrors((current) => {
        if (!current[fieldName]) {
          return current;
        }

        return {
          ...current,
          [fieldName]: undefined,
        };
      });
    },
    [],
  );

  const clearSampleFieldErrors = useCallback(() => {
    setFieldErrors((current) => {
      if (Object.keys(current.sampleFields).length === 0) {
        return current;
      }

      return {
        ...current,
        sampleFields: {},
      };
    });
  }, []);

  const setTemplateName = useCallback((value: string) => {
    clearSimpleFieldError("templateName");
    setTemplateNameState(value);
  }, [clearSimpleFieldError]);

  const setSelectedCategory = useCallback((value: Category | null) => {
    clearSimpleFieldError("categoryId");
    setSelectedCategoryState(value);
  }, [clearSimpleFieldError]);

  const setCtas = useCallback((value: SelectOption[]) => {
    clearSimpleFieldError("ctas");
    clearSampleFieldErrors();
    setCtasState(value);
  }, [clearSampleFieldErrors, clearSimpleFieldError]);

  const setHeader = useCallback((value: string) => {
    setHeaderState(value);
  }, []);

  const setBody: React.Dispatch<SetStateAction<string>> = useCallback((value) => {
    clearSimpleFieldError("body");
    setBodyState(value);
  }, [clearSimpleFieldError]);

  const setFooter = useCallback((value: string) => {
    setFooterState(value);
  }, []);

  const setVariablesMap: React.Dispatch<
    SetStateAction<Record<string, string>>
  > = useCallback((value) => {
    clearSampleFieldErrors();
    setVariablesMapState((current) => {
      const nextValue =
        typeof value === "function"
          ? value(current)
          : value;

      return formatTemplateSampleVariablesMap(nextValue, "mask");
    });
  }, [clearSampleFieldErrors]);

  useEffect(() => {
    const trackedVariables = Array.from(
      new Set([...validBodyVariables, ...requiredCtaVariables]),
    );

    const nextSelected = VARIABLE_OPTIONS.filter((option) =>
      trackedVariables.includes(option.id),
    );

    setVarsSelected((current) =>
      areSameOptionLists(current, nextSelected) ? current : nextSelected,
    );

    setVariablesMap((current) => {
      const nextMap = Object.fromEntries(
        trackedVariables.map((variableName) => [
          variableName,
          current[variableName] ?? "",
        ]),
      );

      return areSameVariablesMap(current, nextMap) ? current : nextMap;
    });
  }, [requiredCtaVariables, validBodyVariables]);

  const isSubmitting = createTemplateMutation.isPending;

  const categoryPlaceholder = isCategoriesLoading
    ? "Carregando categorias..."
    : categoryOptions.length > 0
      ? "Selecione uma categoria"
      : "Nenhuma categoria cadastrada";

  const previewBody = useMemo(() => {
    return Object.entries(variablesMap).reduce((previewText, [key, value]) => {
      return previewText.replaceAll(`{{${key}}}`, value || `{{${key}}}`);
    }, body);
  }, [body, variablesMap]);

  const handleBack = () => {
    navigate(`/templates${normalizedSearch}`);
  };

  const validateForm = () => {
    const nextErrors = createEmptyFieldErrors();
    const formValues = sanitizeTemplateFormValues({
      templateName,
      categoryId: selectedCategory?.id ?? "",
      header,
      body,
      footer,
      ctaIds: ctas,
      variablesMap,
    });

    let parsed:
      | ReturnType<typeof templateCreateSchema.safeParse>
      | null = null;

    try {
      parsed = templateCreateSchema.safeParse(formValues);
    } catch (error) {
      console.error(
        "[useCreateTemplatePageController] Falha inesperada ao validar formulario do template.",
        error,
        formValues,
      );
    }

    if (parsed && !parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const [fieldName, nestedFieldName] = issue.path;

        if (fieldName === "templateName" && !nextErrors.templateName) {
          nextErrors.templateName = issue.message;
          return;
        }

        if (fieldName === "categoryId" && !nextErrors.categoryId) {
          nextErrors.categoryId = issue.message;
          return;
        }

        if (fieldName === "body" && !nextErrors.body) {
          nextErrors.body = issue.message;
          return;
        }

        if (fieldName === "ctaIds" && !nextErrors.ctas) {
          nextErrors.ctas = issue.message;
          return;
        }

        if (
          fieldName === "variablesMap" &&
          typeof nestedFieldName === "string" &&
          !nextErrors.sampleFields[nestedFieldName]
        ) {
          nextErrors.sampleFields[nestedFieldName] = issue.message;
        }
      });
    }

    if (!selectedCategory?.name && !nextErrors.categoryId) {
      nextErrors.categoryId = "Selecione uma categoria.";
    }

    if (!nextErrors.templateName && !toMetaTemplateName(templateName)) {
      nextErrors.templateName =
        "Use pelo menos uma letra ou numero no nome do template.";
    }

    if (!nextErrors.body && invalidBodyVariables.length > 0) {
      nextErrors.body = getInvalidVariablesMessage(invalidBodyVariables);
    }

    setFieldErrors(nextErrors);

    const hasErrors = Boolean(
      nextErrors.templateName ||
        nextErrors.categoryId ||
        nextErrors.body ||
        nextErrors.ctas ||
        Object.keys(nextErrors.sampleFields).length,
    );

    return {
      success: !hasErrors,
      errors: nextErrors,
    };
  };

  const handleSaveTemplate = async () => {
    const validation = validateForm();

    if (!validation.success) {
      const firstErrorMessage = getFirstFieldErrorMessage(validation.errors);
      if (firstErrorMessage) {
        toast.error(firstErrorMessage);
      }
      return;
    }

    const normalizedName = templateName.trim();
    const normalizedBody = body.trim();
    const normalizedVariablesMap = formatTemplateSampleVariablesMap(
      variablesMap,
      "normalize",
    );

    const bodyWithMetaOrder = toMetaIndexedBody(normalizedBody, validBodyVariables);
    const components: TemplateCreateComponent[] = [];

    if (header.trim()) {
      components.push({
        type: "HEADER",
        format: "TEXT",
        text: header.trim(),
      });
    }

    const bodyComponent: TemplateCreateComponent = {
      type: "BODY",
      text: bodyWithMetaOrder,
    };

    if (validBodyVariables.length > 0) {
      bodyComponent.example = {
        body_text: buildBodyExamples(validBodyVariables, normalizedVariablesMap),
      };
    }

    components.push(bodyComponent);

    if (footer.trim()) {
      components.push({
        type: "FOOTER",
        text: footer.trim(),
      });
    }

    if (ctas.length) {
      const buttonDefinitions: TemplateCreateButton[] = [];

      for (const cta of ctas) {
        if (cta.id === "pay_now") {
          const linkExample = String(
            normalizedVariablesMap.link_boleto_pdf ?? "",
          ).trim();

          buttonDefinitions.push({
            type: "URL",
            text: cta.name,
            url: linkExample,
            example: [linkExample],
          });
          continue;
        }

        buttonDefinitions.push(buildCtaButton());
      }

      components.push({
        type: "BUTTONS",
        buttons: buttonDefinitions,
      });
    }

    const variables = validBodyVariables.reduce<Record<string, string>>(
      (accumulator, variableName, index) => {
        accumulator[String(index + 1)] = variableName;
        return accumulator;
      },
      {},
    );

    const payload: TemplateCreateInput = {
      name: toMetaTemplateName(normalizedName),
      language: "pt_BR",
      category: mapCategoryToMetaCategory(selectedCategory!.name),
      displayCategory: selectedCategory!.name,
      components,
      variables,
    };

    const loadingId = showLoading("Criando template...");

    try {
      await createTemplateMutation.mutateAsync(payload);
      navigate(`/templates${normalizedSearch}`);
      window.setTimeout(() => hideLoading(loadingId), 250);
    } catch {
      hideLoading(loadingId);
    }
  };

  return {
    templateName,
    setTemplateName,
    categoryOpen,
    setCategoryOpen,
    ctaOpen,
    setCtaOpen,
    varOpen,
    setVarOpen,
    selectedCategory,
    setSelectedCategory,
    ctas,
    setCtas,
    varsSelected,
    setVarsSelected,
    header,
    setHeader,
    body,
    setBody,
    footer,
    setFooter,
    variablesMap,
    setVariablesMap,
    previewBody,
    isSubmitting,
    templateNameError: fieldErrors.templateName,
    categoryError: fieldErrors.categoryId,
    bodyError: fieldErrors.body,
    ctasError: fieldErrors.ctas,
    sampleFieldErrors: fieldErrors.sampleFields,
    categoryOptions,
    isCategoriesLoading,
    isCategoriesError,
    categoryPlaceholder,
    ctaOptions: CTA_OPTIONS,
    variableOptions: VARIABLE_OPTIONS,
    variableLabels: Object.fromEntries(VARIABLE_OPTIONS.map((o) => [o.id, o.name])),
    availableVariableNames,
    validBodyVariables,
    invalidBodyVariables,
    handleBack,
    handleSaveTemplate,
  };
}
