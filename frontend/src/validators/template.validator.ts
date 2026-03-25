import type { Template, mappedVars } from "../types";
import type { Recipient } from "../mappers/templateVars.mapper";
import {
  normalizeTemplateVars,
  buildTemplateVars,
  getOrderedTemplateVariableKeys,
} from "../mappers/templateVars.mapper";

function hasOrderDetailsButton(template: Template): boolean {
  let components: Array<Record<string, unknown>> = [];

  if (Array.isArray(template.components)) {
    components = template.components as Array<Record<string, unknown>>;
  } else if (typeof template.components === "string") {
    try { components = JSON.parse(template.components); } catch { return false; }
  } else if (template.components && typeof template.components === "object" && Array.isArray((template.components as any).components)) {
    components = (template.components as any).components;
  }

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
  const hasPixVar = Object.values(vars).some((v) => String(v) === "code_pix");
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
  const allVars = buildTemplateVars(recipient, template);
  return getOrderedTemplateVariableKeys(template).filter((fieldKey) => {
    if (fieldKey === "whatsapp") return false;
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

  return mappedVarsList.map((mappedVar, index) => {
    const bodyPreview = Object.keys(templateVars)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => ({
        key: templateVars[key],
        value: String(mappedVar[templateVars[key] as keyof mappedVars] ?? ""),
      }));

    return {
      index,
      number: String(mappedVar.whatsapp ?? ""),
      missingNumber: !String(mappedVar.whatsapp ?? "").trim(),
      missingFields: bodyPreview.filter((item) => !item.value.trim()).map((item) => item.key),
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
