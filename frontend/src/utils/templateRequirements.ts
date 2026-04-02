import type { Template } from "../types";

const INVOICE_VARIABLE_KEYS = new Set([
  "data_vencimento_fatura",
  "numero_contrato",
  "valor_fatura",
  "linha_digitavel_boleto",
  "link_boleto_pdf",
  "code_pix",
  "codigo_qr",
  "codigo_qr_code",
  "codigo_pix",
]);

function normalizeTemplateVariables(variables: Template["variables"]) {
  if (typeof variables === "string") {
    try {
      return JSON.parse(variables) as Record<string, string>;
    } catch {
      return {};
    }
  }

  return variables ?? {};
}

function normalizeTemplateComponents(components: Template["components"]) {
  if (Array.isArray(components)) {
    return components as Array<Record<string, unknown>>;
  }

  if (typeof components === "string") {
    try {
      return normalizeTemplateComponents(JSON.parse(components) as Template["components"]);
    } catch {
      return [];
    }
  }

  if (
    components &&
    typeof components === "object" &&
    Array.isArray((components as { components?: unknown }).components)
  ) {
    return (components as { components: Array<Record<string, unknown>> }).components;
  }

  return [];
}

function getTemplateComponentRequiredInvoiceFields(template: Template) {
  const components = normalizeTemplateComponents(template.components);
  const requiredFields = new Set<string>();

  components.forEach((component) => {
    const componentType = String(component?.type ?? "").toUpperCase();

    if (
      componentType === "HEADER" &&
      String(component?.format ?? "").toUpperCase() === "DOCUMENT"
    ) {
      requiredFields.add("link_boleto_pdf");
    }

    if (componentType !== "BUTTON" && componentType !== "BUTTONS") {
      return;
    }

    const buttons: Array<Record<string, unknown>> = Array.isArray(component?.buttons)
      ? (component.buttons as Array<Record<string, unknown>>)
      : component?.sub_type
        ? [{ type: component.sub_type, text: component.text }]
        : [];

    buttons.forEach((button) => {
      const buttonType = String(button?.type ?? button?.sub_type ?? "").toUpperCase();

      if (buttonType === "ORDER_DETAILS") {
        requiredFields.add("code_pix");
        requiredFields.add("valor_fatura");
        requiredFields.add("numero_contrato");
        return;
      }

      if (buttonType === "COPY_CODE") {
        requiredFields.add("code_pix");
        return;
      }

      if (buttonType === "URL") {
        requiredFields.add("link_boleto_pdf");
      }
    });
  });

  return Array.from(requiredFields);
}

export function templateRequiresInvoiceData(template?: Template | null) {
  if (!template) {
    return false;
  }

  const templateVars = normalizeTemplateVariables(template.variables);
  const category = String(template.category ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (category.includes("cobr")) {
    return true;
  }

  if (
    Object.values(templateVars).some((variableName) =>
      INVOICE_VARIABLE_KEYS.has(String(variableName ?? "").trim()),
    )
  ) {
    return true;
  }

  return getTemplateComponentRequiredInvoiceFields(template).some((fieldKey) =>
    INVOICE_VARIABLE_KEYS.has(fieldKey),
  );
}
