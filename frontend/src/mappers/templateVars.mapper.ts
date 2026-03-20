import type { Cliente, Template, mappedVars } from "../types";
import { compilarTemplate } from "../utils/validation";
import { AppStorage } from "../services/storage/storage.service";

export type Recipient = {
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
  order_reference_id?: string;
  order_item_name?: string;
  order_item_description?: string;
  order_pix_merchant_name?: string;
  order_pix_key?: string;
  order_pix_key_type?: string;
};

// Exportada para reutilização no builder e no validator
export function normalizeTemplateVars(variables: Template["variables"]) {
  return typeof variables === "string"
    ? (JSON.parse(variables) as Record<string, string>)
    : variables;
}

function getInvoice(recipient: Recipient) {
  const list = recipient.invoices?.list;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list[0];
}

function toLower(value?: string) {
  return value?.toLowerCase() ?? "";
}

/**
 * Converte string de moeda (ex: "R$ 250,00", "250.00") para centavos inteiros.
 * Retorna 0 quando não é possível converter.
 */
export function parseAmountToCents(value?: string): number {
  if (!value) return 0;
  const clean = value.replace(/[R$\s]/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const parsed = parseFloat(normalized);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function getOrderedTemplateVariableKeys(template: Template) {
  const vars = normalizeTemplateVars(template.variables);
  return Array.from(
    new Set(
      Object.keys(vars)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => String(vars[key] ?? "").trim())
        .filter(Boolean)
    )
  );
}

export function buildTemplateVars(recipient: Recipient, template: Template): mappedVars {
  const invoice = getInvoice(recipient);
  const attendantName = recipient.nome_atendente ?? AppStorage.getAttendantName();
  const companyName =
    recipient.company?.name?.trim() ||
    AppStorage.getDispatchCompanyName() ||
    template.company?.name?.trim() ||
    "";
  const pixCode =
    (invoice?.code_pix?.status === "success" ? invoice.code_pix.pix : undefined) ||
    recipient.code_pix ||
    recipient.codigo_qr ||
    recipient.codigo_qr_code ||
    recipient.codigo_pix ||
    "";

  const EXCLUDED_KEYS = ["id", "name", "cnpj_cpf", "whatsapp", "inputSource", "company", "invoices"];
  const customFields = Object.fromEntries(
    Object.entries(recipient)
      .filter(([key, value]) => typeof value === "string" && !EXCLUDED_KEYS.includes(key))
      .map(([key, value]) => [key, String(value).trim()])
  );

  const numeroContrato = invoice?.contract_id ?? recipient.numero_contrato ?? "";
  const valorFatura = invoice?.invoice_amount ?? recipient.valor_fatura ?? "";
  return {
    ...customFields,
    nome_cliente: toLower(recipient.name ?? recipient.nome_cliente),
    whatsapp: recipient.whatsapp ?? "",
    cnpj_cpf: recipient.cnpj_cpf ?? "",
    nome_atendente: toLower(attendantName),
    data_vencimento_fatura: invoice?.invoice_due_date ?? recipient.data_vencimento_fatura ?? "",
    nome_empresa: toLower(companyName),
    numero_contrato: numeroContrato,
    valor_fatura: valorFatura,
    linha_digitavel_boleto: invoice?.ticket_digitable_line ?? recipient.linha_digitavel_boleto ?? "",
    link_boleto_pdf: invoice?.ticket_pdf_link ?? recipient.link_boleto_pdf ?? "",
    code_pix: pixCode,
    codigo_qr: pixCode,
    codigo_qr_code: pixCode,
    codigo_pix: pixCode,
    order_reference_id: recipient.order_reference_id ?? numeroContrato ?? recipient.id ?? "",
    order_item_name: recipient.order_item_name ?? "Fatura",
    order_item_description: recipient.order_item_description ?? "",
    order_pix_merchant_name: recipient.order_pix_merchant_name ?? companyName ?? "",
    order_pix_key: recipient.order_pix_key ?? AppStorage.getCompanyCnpj(),
    order_pix_key_type: recipient.order_pix_key_type ?? (AppStorage.getCompanyCnpj() ? "CNPJ" : ""),
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
): mappedVars[] {
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
