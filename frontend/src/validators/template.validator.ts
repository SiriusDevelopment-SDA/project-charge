import type { Template, mappedVars } from "../types";
import type { Recipient } from "../mappers/templateVars.mapper";
import {
  normalizeTemplateVars,
  buildTemplateVars,
  getOrderedTemplateVariableKeys,
} from "../mappers/templateVars.mapper";

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
