import { useEffect, useMemo, useState } from "react";
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
import { useGlobalLoading } from "../../useGlobalLoading";
import { useCreateTemplateMutation } from "../../mutations/useTemplateMutations";
import { useCategoriesQuery } from "../../queries/useCampaignsQuery";

type SelectOption = {
  id: string;
  name: string;
};

const ORDER_DETAILS_BUTTON_TEXT = "Copy Pix code";

const CTA_OPTIONS: SelectOption[] = [
  { id: "pay_now", name: "Pagar agora" },
  { id: "copy_code", name: ORDER_DETAILS_BUTTON_TEXT },
];

const VARIABLE_OPTIONS: SelectOption[] = [
  { id: "nome_cliente", name: "nome_cliente" },
  { id: "nome_atendente", name: "nome_atendente" },
  { id: "data_vencimento_fatura", name: "data_vencimento_fatura" },
  { id: "numero_contrato", name: "numero_contrato" },
  { id: "valor_fatura", name: "valor_fatura" },
  { id: "linha_digitavel_boleto", name: "linha_digitavel_boleto" },
  { id: "link_boleto_pdf", name: "link_boleto_pdf" },
  { id: "code_pix", name: "code_pix" },
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

function buildCtaButton(cta: SelectOption): TemplateCreateButton {
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
  return orderedVars.map((variableName) => {
    const sampleValue = String(variablesMap[variableName] ?? "").trim();
    return sampleValue || variableName;
  });
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

export function useCreateTemplatePageController() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showLoading, hideLoading } = useGlobalLoading();
  const createTemplateMutation = useCreateTemplateMutation();
  const {
    data: categories = [],
    isLoading: isCategoriesLoading,
    isError: isCategoriesError,
  } = useCategoriesQuery();

  const [templateName, setTemplateName] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [ctaOpen, setCtaOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [ctas, setCtas] = useState<SelectOption[]>([]);
  const [varsSelected, setVarsSelected] = useState<SelectOption[]>([]);
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [variablesMap, setVariablesMap] = useState<Record<string, string>>({});

  const categoryOptions = useMemo(
    () =>
      [...categories].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }),
      ),
    [categories],
  );

  const availableVariableNames = useMemo(
    () => VARIABLE_OPTIONS.map((option) => option.name),
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

  useEffect(() => {
    const trackedVariables = Array.from(
      new Set([...validBodyVariables, ...requiredCtaVariables]),
    );

    const nextSelected = VARIABLE_OPTIONS.filter((option) =>
      trackedVariables.includes(option.name),
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
    navigate(`/templates${location.search}`);
  };

  const handleSaveTemplate = async () => {
    const normalizedName = templateName.trim();
    const normalizedBody = body.trim();

    if (!normalizedName) {
      toast.error("Informe o nome do template.");
      return;
    }

    if (!selectedCategory?.name) {
      toast.error("Selecione uma categoria.");
      return;
    }

    if (!normalizedBody) {
      toast.error("Preencha o corpo do template.");
      return;
    }

    if (invalidBodyVariables.length > 0) {
      const invalidLabel =
        invalidBodyVariables.length === 1
          ? `A variavel ${invalidBodyVariables[0]} nao existe ou esta mal formatada.`
          : `Corrija as variaveis invalidas: ${invalidBodyVariables.join(", ")}.`;
      toast.error(invalidLabel);
      return;
    }

    const bodyWithMetaOrder = toMetaIndexedBody(normalizedBody, validBodyVariables);
    const bodyExamples = buildBodyExamples(validBodyVariables, variablesMap);
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

    if (bodyExamples.length > 0) {
      bodyComponent.example = {
        body_text: bodyExamples,
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
          const linkExample = String(variablesMap.link_boleto_pdf ?? "").trim();

          if (!linkExample) {
            toast.error(
              "Preencha a amostra da variavel link_boleto_pdf para o botao Pagar agora.",
            );
            return;
          }

          buttonDefinitions.push({
            type: "URL",
            text: cta.name,
            url: linkExample,
            example: [linkExample],
          });
          continue;
        }

        buttonDefinitions.push(buildCtaButton(cta));
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
      name: normalizedName,
      language: "pt_BR",
      category: mapCategoryToMetaCategory(selectedCategory.name),
      displayCategory: selectedCategory.name,
      components,
      variables,
    };

    const loadingId = showLoading("Criando template...");

    try {
      await createTemplateMutation.mutateAsync(payload);
      navigate(`/templates${location.search}`);
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
    categoryOptions,
    isCategoriesLoading,
    isCategoriesError,
    categoryPlaceholder,
    ctaOptions: CTA_OPTIONS,
    variableOptions: VARIABLE_OPTIONS,
    availableVariableNames,
    validBodyVariables,
    invalidBodyVariables,
    handleBack,
    handleSaveTemplate,
  };
}
