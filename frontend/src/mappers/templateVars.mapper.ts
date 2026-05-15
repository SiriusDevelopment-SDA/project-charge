import type { Cliente, Template, mappedVars } from "../types";
import { compilarTemplate } from "../utils/validation";
import { AppStorage } from "../services/storage/storage.service";
import { normalizeCurrencyValue, normalizeDateValue } from "../utils/templateFieldFormat";

function formatDueDate(date?: string): string {
  return normalizeDateValue(date);
  // YYYY-MM-DD → DD/MM/YYYY
}

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

export function buildTemplateVars(
  recipient: Recipient,
  template: Template,
  options?: { skipStorage?: boolean },
): mappedVars {
  const skipStorage = options?.skipStorage ?? false;
  const invoice = getInvoice(recipient);
  const attendantName =
    recipient.nome_atendente
    ?? (skipStorage ? AppStorage.getAgentName() : AppStorage.getAttendantName());
  const companyName =
    recipient.company?.name?.trim() ||
    (skipStorage ? "" : AppStorage.getDispatchCompanyName()) ||
    template.company?.name?.trim() ||
    "";
  const rawPix = invoice?.code_pix;
  const pixCode =
    (typeof rawPix === "string" && rawPix && rawPix !== "null" ? rawPix : undefined) ||
    recipient.code_pix ||
    recipient.codigo_qr ||
    recipient.codigo_qr_code ||
    recipient.codigo_pix ||
    "";

  const EXCLUDED_KEYS = ["id", "clientId", "name", "cnpj_cpf", "whatsapp", "inputSource", "company", "invoices"];
  const customFields = Object.fromEntries(
    Object.entries(recipient)
      .filter(([key, value]) => typeof value === "string" && !EXCLUDED_KEYS.includes(key))
      .map(([key, value]) => [key, String(value).trim()])
  );

  const numeroContrato = invoice?.contract_id ?? recipient.numero_contrato ?? "";
  const valorFatura = normalizeCurrencyValue(
    invoice?.invoice_amount ?? recipient.valor_fatura ?? ""
  );
  return {
    ...customFields,
    nome_cliente: toLower(recipient.name ?? recipient.nome_cliente),
    whatsapp: recipient.whatsapp ?? "",
    cnpj_cpf: recipient.cnpj_cpf ?? "",
    nome_atendente: toLower(attendantName),
    data_vencimento_fatura: formatDueDate(invoice?.invoice_due_date ?? recipient.data_vencimento_fatura),
    nome_empresa: toLower(companyName),
    numero_contrato: numeroContrato,
    valor_fatura: valorFatura,
    linha_digitavel_boleto: invoice?.ticket_digitable_line ?? recipient.linha_digitavel_boleto ?? "",
    link_boleto_pdf: invoice?.ticket_pdf_link ?? recipient.link_boleto_pdf ?? "",
    code_pix: pixCode,
    codigo_qr: pixCode,
    codigo_qr_code: pixCode,
    codigo_pix: pixCode,
    order_reference_id: numeroContrato || recipient.order_reference_id || recipient.id || "",
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
  options?: { filterByTemplateVars?: boolean; skipStorage?: boolean }
): mappedVars[] {
  const templateVars = normalizeTemplateVars(template.variables);
  const filterByTemplateVars = options?.filterByTemplateVars ?? true;

  return recipients.map((recipient) => {
    const allVars = buildTemplateVars(recipient, template, { skipStorage: options?.skipStorage });
    const varsForMessage = filterByTemplateVars
      ? pickTemplateVars(templateVars, allVars)
      : (allVars as Record<string, string>);

    const invoice = getInvoice(recipient);
    return {
      clientId: recipient.id,
      cnpj_cpf: allVars.cnpj_cpf,
      whatsapp: allVars.whatsapp,
      invoice_id: invoice?.invoice_id ? String(invoice.invoice_id) : undefined,
      ...varsForMessage,
      mensagem: compilarTemplate(template.message, template.variables, varsForMessage),
    } as mappedVars;
  });
}
