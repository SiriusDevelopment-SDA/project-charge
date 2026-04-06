import type { Template, mappedVars } from "../types";
import type { Recipient } from "../mappers/templateVars.mapper";
import {
  normalizeTemplateVars,
  buildTemplateVars,
  getOrderedTemplateVariableKeys,
} from "../mappers/templateVars.mapper";

const PIX_TEMPLATE_VARIABLE_KEYS = new Set([
  "code_pix",
  "codigo_qr",
  "codigo_qr_code",
  "codigo_pix",
]);

/**
 * Campos preenchidos pelo backend no momento do disparo (TemplateDispatchPayloadService).
 * O IXC nao retorna PIX para o frontend — o PIX e buscado via API do ERP no momento do disparo.
 * Esses campos NAO devem ser considerados "ausentes" na criacao da campanha.
 */
export const DISPATCH_TIME_FIELDS = new Set([
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

function normalizeTemplateComponents(template: Template): Array<Record<string, unknown>> {
  const { components } = template;

  if (Array.isArray(components)) {
    return components as Array<Record<string, unknown>>;
  }

  if (typeof components === "string") {
    try {
      const parsed = JSON.parse(components) as Template["components"];

      if (Array.isArray(parsed)) {
        return parsed as Array<Record<string, unknown>>;
      }

      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { components?: unknown }).components)
      ) {
        return (parsed as { components: Array<Record<string, unknown>> }).components;
      }
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

function getComponentRequiredFields(template: Template): string[] {
  const components = normalizeTemplateComponents(template);
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

      if (buttonType !== "URL") {
        return;
      }

      requiredFields.add("link_boleto_pdf");
    });
  });

  return Array.from(requiredFields);
}

function hasOrderDetailsButton(template: Template): boolean {
  const components = normalizeTemplateComponents(template);

  return components.some((c) => {
    const type = String(c?.type ?? "").toUpperCase();
    if (type === "BUTTON" || type === "BUTTONS") {
      const buttons: Array<Record<string, unknown>> = Array.isArray(c?.buttons)
        ? (c.buttons as Array<Record<string, unknown>>)
        : c?.sub_type ? [{ type: c.sub_type }] : [];
      return buttons.some((b) =>
        String(b?.type ?? b?.sub_type ?? "").toUpperCase() === "ORDER_DETAILS",
      );
    }
    return false;
  });
}

export function templateRequiresPix(template: Template): boolean {
  const vars = normalizeTemplateVars(template.variables);
  const hasPixVar = Object.values(vars).some((v) =>
    PIX_TEMPLATE_VARIABLE_KEYS.has(String(v)),
  );
  return hasPixVar || hasOrderDetailsButton(template);
}

export function templateRequiresAttendantName(template: Template): boolean {
  const vars = normalizeTemplateVars(template.variables);
  return Object.values(vars).some((v) => String(v) === "nome_atendente");
}

export function templateRequiresCompanyName(template: Template): boolean {
  const vars = normalizeTemplateVars(template.variables);
  return Object.values(vars).some((v) => String(v) === "nome_empresa");
}

export function getMissingTemplateVariables(template: Template, recipient: Recipient): string[] {
  const allVars = buildTemplateVars(recipient, template, { skipStorage: true });
  const requiredFields = Array.from(
    new Set([...getOrderedTemplateVariableKeys(template), ...getComponentRequiredFields(template)]),
  );

  return requiredFields.filter((fieldKey) => {
    if (fieldKey === "whatsapp") return false;
    // Campos de invoice/PIX sao preenchidos pelo backend no momento do disparo.
    // Nao devem bloquear a criacao da campanha no frontend.
    if (DISPATCH_TIME_FIELDS.has(fieldKey)) return false;
    return !String(allVars[fieldKey as keyof mappedVars] ?? "").trim();
  });
}

export type TemplateRecipientDiagnostic = {
  index: number;
  number: string;
  missingNumber: boolean;
  missingFields: string[];
  bodyPreview: Array<{ key: string; value: string }>;
};

export function diagnoseTemplateRecipients(
  template: Template,
  mappedVarsList: mappedVars[]
): TemplateRecipientDiagnostic[] {
  const templateVars = normalizeTemplateVars(template.variables);
  const componentRequiredFields = getComponentRequiredFields(template);

  return mappedVarsList.map((mappedVar, index) => {
    const bodyPreview = Object.keys(templateVars)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => ({
        key: templateVars[key],
        value: String(mappedVar[templateVars[key] as keyof mappedVars] ?? ""),
      }));

    const missingFields = Array.from(
      new Set([
        ...bodyPreview.filter((item) => !item.value.trim()).map((item) => item.key),
        ...componentRequiredFields.filter(
          (fieldKey) => !String(mappedVar[fieldKey as keyof mappedVars] ?? "").trim(),
        ),
      ]),
    // Campos de invoice/PIX sao preenchidos pelo backend no momento do disparo.
    // Nao devem ser reportados como "ausentes" na criacao da campanha.
    ).filter((fieldKey) => !DISPATCH_TIME_FIELDS.has(fieldKey));

    return {
      index,
      number: String(mappedVar.whatsapp ?? ""),
      missingNumber: !String(mappedVar.whatsapp ?? "").trim(),
      missingFields,
      bodyPreview,
    };
  });
}

export function getIncompleteTemplateRecipients(
  template: Template,
  mappedVarsList: mappedVars[]
): TemplateRecipientDiagnostic[] {
  return diagnoseTemplateRecipients(template, mappedVarsList).filter(
    (r) => r.missingNumber || r.missingFields.length > 0
  );
}

export function areOnlyAttendantFieldsMissing(
  incompleteRecipients: TemplateRecipientDiagnostic[]
): boolean {
  return (
    incompleteRecipients.length > 0 &&
    incompleteRecipients.every(
      (r) =>
        !r.missingNumber &&
        r.missingFields.length === 1 &&
        r.missingFields[0] === "nome_atendente"
    )
  );
}
