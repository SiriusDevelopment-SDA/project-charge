import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import type { Category } from "../../../types";
import type {
  TemplateCreateComponent,
  TemplateCreateInput,
} from "../../../types/templateApiTypes";
import { useCreateTemplateMutation } from "../../mutations/useTemplateMutations";
import { useCategoriesQuery } from "../../queries/useCampaignsQuery";

type SelectOption = {
  id: string;
  name: string;
};

const CTA_OPTIONS: SelectOption[] = [
  { id: "pay_now", name: "Pagar agora" },
  { id: "order_details", name: "Copiar código Pix" },
];

const VARIABLE_OPTIONS: SelectOption[] = [
  { id: "nome_cliente", name: "nome_cliente" },
  { id: "nome_atendente", name: "nome_atendente" },
  { id: "nome_empresa", name: "nome_empresa" },
  { id: "data_vencimento_fatura", name: "data_vencimento_fatura" },
  { id: "numero_contrato", name: "numero_contrato" },
  { id: "valor_fatura", name: "valor_fatura" },
  { id: "linha_digitavel_boleto", name: "linha_digitavel_boleto" },
  { id: "link_boleto_pdf", name: "link_boleto_pdf" },
  { id: "code_pix", name: "code_pix" },
  { id: "codigo_qr", name: "codigo_qr" },
  { id: "codigo_qr_code", name: "codigo_qr_code" },
  { id: "codigo_pix", name: "codigo_pix" },
  { id: "order_reference_id", name: "order_reference_id" },
  { id: "order_item_name", name: "order_item_name" },
  { id: "order_item_description", name: "order_item_description" },
  { id: "order_pix_merchant_name", name: "order_pix_merchant_name" },
  { id: "order_pix_key", name: "order_pix_key" },
  { id: "order_pix_key_type", name: "order_pix_key_type" },
];

const DEFAULT_BODY_PREVIEW = "Veja aqui a prévia do corpo do seu template.";

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

function mapCtaType(ctaId: string): "URL" | "ORDER_DETAILS" {
  if (ctaId === "order_details") return "ORDER_DETAILS";
  return "URL";
}

function extractOrderedVarsFromBody(body: string, allowedVars: string[]) {
  const found: string[] = [];
  const seen = new Set<string>();
  const regex = /\{\{([^}]+)\}\}/g;
  let match: RegExpExecArray | null = regex.exec(body);

  while (match) {
    const varName = String(match[1] ?? "").trim();

    if (varName && allowedVars.includes(varName) && !seen.has(varName)) {
      seen.add(varName);
      found.push(varName);
    }

    match = regex.exec(body);
  }

  return found;
}

function toMetaIndexedBody(body: string, orderedVars: string[]) {
  return orderedVars.reduce((accumulator, variableName, index) => {
    return accumulator.replaceAll(`{{${variableName}}}`, `{{${index + 1}}}`);
  }, body);
}

export function useCreateTemplatePageController() {
  const navigate = useNavigate();
  const location = useLocation();
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

  const isSubmitting = createTemplateMutation.isPending;

  const categoryPlaceholder = isCategoriesLoading
    ? "Carregando categorias..."
    : categoryOptions.length > 0
      ? "Selecione uma categoria"
      : "Nenhuma categoria cadastrada";

  const previewBody = useMemo(() => {
    const templateText = body.trim() || DEFAULT_BODY_PREVIEW;

    return Object.entries(variablesMap).reduce((previewText, [key, value]) => {
      return previewText.replaceAll(`{{${key}}}`, value || `{{${key}}}`);
    }, templateText);
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

    if (!varsSelected.length) {
      toast.error("Selecione ao menos uma variável.");
      return;
    }

    const selectedVariableNames = varsSelected.map((item) => String(item.name));
    const orderedVars = extractOrderedVarsFromBody(normalizedBody, selectedVariableNames);

    if (!orderedVars.length) {
      toast.error(
        "Inclua as variáveis no corpo do template para definir a ordem do Meta.",
      );
      return;
    }

    const bodyWithMetaOrder = toMetaIndexedBody(normalizedBody, orderedVars);
    const components: TemplateCreateComponent[] = [];

    if (header.trim()) {
      components.push({
        type: "HEADER",
        format: "TEXT",
        text: header.trim(),
      });
    }

    components.push({
      type: "BODY",
      text: bodyWithMetaOrder,
    });

    if (footer.trim()) {
      components.push({
        type: "FOOTER",
        text: footer.trim(),
      });
    }

    if (ctas.length) {
      components.push({
        type: "BUTTONS",
        buttons: ctas.map((cta) => ({
          type: mapCtaType(cta.id),
          text: cta.name,
        })),
      });
    }

    const variables = orderedVars.reduce<Record<string, string>>(
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

    await createTemplateMutation.mutateAsync(payload);
    handleBack();
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
    isSubmitting,
    previewBody,
    categoryOptions,
    isCategoriesLoading,
    isCategoriesError,
    categoryPlaceholder,
    ctaOptions: CTA_OPTIONS,
    variableOptions: VARIABLE_OPTIONS,
    handleBack,
    handleSaveTemplate,
  };
}
