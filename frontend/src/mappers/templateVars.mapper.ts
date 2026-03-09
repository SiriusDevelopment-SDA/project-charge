import type { Cliente, Lead, Template, mappedVars } from "../types";
import { compilarTemplate } from "../utils/validation";

type Recipient = {
  id?: string;
  name?: string;
  cnpj_cpf?: string;
  whatsapp?: string;

  invoices?: Cliente["invoices"];
  company?: Cliente["company"];

  nome_cliente?: string;
  nome_atendente?: string;
  data_vencimento_fatura?: string;
  numero_contrato?: string;
  valor_fatura?: string;

  linha_digitavel_boleto?: string;
  link_boleto_pdf?: string;

  code_pix?: string;
  codigo_qr?: string;
  codigo_qr_code?: string;
  codigo_pix?: string;
};

type TemplateButtonBlueprint = {
  type?: string;
  sub_type?: string;
  index?: string | number;
};

type TemplateComponentBlueprint = {
  type?: string;
  format?: string;
  buttons?: TemplateButtonBlueprint[];
  sub_type?: string;
  index?: string | number;
};

function normalizeTemplateVars(variables: Template["variables"]) {
  return typeof variables === "string"
    ? (JSON.parse(variables) as Record<string, string>)
    : variables;
}

function normalizeTemplateComponents(components: Template["components"]) {
  if (!Array.isArray(components)) return [];
  return components as TemplateComponentBlueprint[];
}

export function getStoredAttendantName() {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("attendant_name") ||
    localStorage.getItem("agent_name") ||
    ""
  ).trim();
}

export function setStoredAttendantName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("attendant_name", name.trim());
}

export function templateRequiresAttendantName(template: Template) {
  const vars = normalizeTemplateVars(template.variables);
  return Object.values(vars).some((value) => String(value) === "nome_atendente");
}

function getInvoice(recipient: Recipient) {
  const list = recipient.invoices?.list;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list[0];
}

function toLower(value?: string) {
  return value?.toLowerCase() ?? "";
}

export function buildTemplateVars(recipient: Recipient, template: Template): mappedVars {
  const invoice = getInvoice(recipient);
  const attendantName =
    recipient.nome_atendente ??
    getStoredAttendantName();
  const pixCode =
    invoice?.code_pix?.pix ??
    recipient.code_pix ??
    recipient.codigo_qr ??
    recipient.codigo_qr_code ??
    recipient.codigo_pix ??
    "";

  return {
    nome_cliente: toLower(recipient.name ?? recipient.nome_cliente),
    whatsapp: recipient.whatsapp ?? "",
    cnpj_cpf: recipient.cnpj_cpf ?? "",
    nome_atendente: toLower(attendantName),
    data_vencimento_fatura:
      invoice?.invoice_due_date ?? recipient.data_vencimento_fatura ?? "",
    nome_empresa:
      toLower(recipient.company?.name) ?? toLower(template.company?.name) ?? "",
    numero_contrato: invoice?.contract_id ?? recipient.numero_contrato ?? "",
    valor_fatura: invoice?.invoice_amount ?? recipient.valor_fatura ?? "",
    linha_digitavel_boleto:
      invoice?.ticket_digitable_line ?? recipient.linha_digitavel_boleto ?? "",
    link_boleto_pdf: invoice?.ticket_pdf_link ?? recipient.link_boleto_pdf ?? "",
    code_pix: pixCode,
    codigo_qr: pixCode,
    codigo_qr_code: pixCode,
    codigo_pix: pixCode,
  };
}

export function pickTemplateVars(
  templateVars: Record<string, string>,
  allVars: mappedVars
): Record<string, string> {
  const picked: Record<string, string> = {};

  Object.values(templateVars).forEach((key) => {
    const value = allVars[key as keyof mappedVars];
    if (typeof value === "string" && value.trim() !== "") {
      picked[key] = value;
    }
  });

  return picked;
}

export function mapRecipientsToTemplateVars(
  recipients: Recipient[],
  template: Template,
  options?: { filterByTemplateVars?: boolean }
) {
  const templateVars = normalizeTemplateVars(template.variables);
  const filterByTemplateVars = options?.filterByTemplateVars ?? true;

  return recipients.map((recipient) => {
    const allVars = buildTemplateVars(recipient, template);
    const varsForMessage = filterByTemplateVars
      ? pickTemplateVars(templateVars, allVars)
      : (allVars as Record<string, string>);

    return {
      clientId: recipient.id,
      cnpj_cpf: allVars.cnpj_cpf,
      whatsapp: allVars.whatsapp,
      ...varsForMessage,
      mensagem: compilarTemplate(template.message, template.variables, varsForMessage),
    } as mappedVars;
  });
}

export function buildTemplateRecipients(
  template: Template,
  mappedVarsList: mappedVars[]
) {
  const templateVars = normalizeTemplateVars(template.variables);
  const templateComponents = normalizeTemplateComponents(template.components);

  const hasDocumentHeader = templateComponents.some(
    (component) =>
      String(component?.type ?? "").toUpperCase() === "HEADER" &&
      String(component?.format ?? "").toUpperCase() === "DOCUMENT"
  );

  const buttonsBlueprint = templateComponents
    .filter((component) => {
      const type = String(component?.type ?? "").toUpperCase();
      return type === "BUTTON" || type === "BUTTONS";
    })
    .flatMap((component) =>
      Array.isArray(component?.buttons)
        ? component.buttons
        : component?.sub_type
          ? [{ type: component.sub_type, index: component.index }]
          : []
    );

  const recipients = mappedVarsList
    .map((mappedVar) => {
      const bodyParameters = Object.keys(templateVars)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => ({
          type: "text" as const,
          text: String(mappedVar[templateVars[key] as keyof mappedVars] ?? ""),
        }));

      if (bodyParameters.some((parameter) => !parameter.text.trim())) {
        return null;
      }

      const components: Array<{
        type: "BODY" | "HEADER" | "BUTTON";
        parameters: Array<{ type: "text"; text: string } | { type: "document"; document: { link: string; filename?: string } }>;
        sub_type?: "URL" | "COPY_CODE";
        index?: string;
      }> = [{ type: "BODY", parameters: bodyParameters }];

      if (hasDocumentHeader) {
        const pdfLink = String(mappedVar.link_boleto_pdf ?? "").trim();
        if (pdfLink) {
          components.push({
            type: "HEADER",
            parameters: [
              {
                type: "document",
                document: {
                  link: pdfLink,
                  filename: "fatura.pdf",
                },
              },
            ],
          });
        }
      }

      buttonsBlueprint.forEach((button, index) => {
        const buttonType = String(button?.type ?? button?.sub_type ?? "").toUpperCase();
        const paramValue =
          buttonType === "URL"
            ? String(mappedVar.link_boleto_pdf ?? "").trim()
            : String(
                mappedVar.code_pix ??
                  mappedVar.codigo_qr_code ??
                  mappedVar.codigo_qr ??
                  mappedVar.codigo_pix ??
                  mappedVar.linha_digitavel_boleto ??
                  ""
              ).trim();

        if (!paramValue) return;

        components.push({
          type: "BUTTON",
          sub_type: buttonType === "URL" ? "URL" : "COPY_CODE",
          index: String(button?.index ?? index),
          parameters: [{ type: "text", text: paramValue }],
        });
      });

      return {
        name: mappedVar.nome_cliente ?? "",
        number: mappedVar.whatsapp ?? "",
        components,
      };
    })
    .filter(
      (item): item is {
        name: string;
        number: string;
        components: Array<{
          type: "BODY" | "HEADER" | "BUTTON";
          parameters: Array<{ type: "text"; text: string } | { type: "document"; document: { link: string; filename?: string } }>;
          sub_type?: "URL" | "COPY_CODE";
          index?: string;
        }>;
      } => Boolean(item)
    );

  return recipients;
}
