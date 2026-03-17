import type { Cliente, Template } from "../types";
import { gerarModeloClientes } from "./gerarModeloPlanilhaClientes";
import { gerarModeloLeads } from "./gerarModeloPlanilhaLeads";
import { toast } from "react-toastify";
import { normalizeDoc } from "./document";

type SpreadsheetRow = Record<string, string | number | null | undefined>;

export function extrairDocumentosClientes(data: SpreadsheetRow[]) {
  if (!data.every((row) => "cnpj_cpf" in row)) {
    throw new Error("Planilha invalida: coluna cnpj_cpf ausente");
  }

  return data
    .map((row) => normalizeDoc(String(row.cnpj_cpf ?? "")))
    .filter((doc) => doc.length === 11 || doc.length === 14);
}

export function extrairLeads(data: SpreadsheetRow[]) {
  if (!data.every((row) => "whatsapp" in row)) {
    toast.warning("Planilha de lead invalida: coluna telefone ausente");
  }

  return data;
}

export const processarDocumentos = (documents: string[]) => {
  if (documents.length === 0) {
    toast.error("Nenhum CNPJ/CPF valido encontrado");
    return;
  }
  toast.success(`${documents.length} documentos processados com sucesso`);
};

export function validarData(valor: string): boolean {
  const d = new Date(valor);
  return !Number.isNaN(d.getTime());
}

export function validarArquivo(file: File) {
  const permitido = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];

  if (!permitido.includes(file.type)) {
    throw new Error("Arquivo invalido. Envie um XLSX.");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Arquivo muito grande.");
  }
}

export function todasColunasPreenchidas(lead: Record<string, unknown>) {
  const camposIgnorados = ["status"];

  return Object.entries(lead)
    .filter(([key]) => !camposIgnorados.includes(key))
    .every(([, value]) => value !== "" && value !== null && value !== undefined);
}

export function gerarModeloPlanilha(
  template: Template | null,
  modo: "clientes" | "leads"
) {
  if (modo === "clientes") {
    return gerarModeloClientes();
  }
  return gerarModeloLeads(template);
}

export function getTipoPlanilha(fileName: string) {
  const name = fileName.toLowerCase();

  if (name.includes("lead")) return "lead";
  if (name.includes("cliente")) return "cliente";

  return "desconhecida";
}

export function compilarTemplate(
  message: string,
  variables: Record<string, string> | string,
  templateMapVars: Record<string, string>
) {
  const vars = typeof variables === "string" ? JSON.parse(variables) : variables;

  return message.replace(/{{(\d+)}}/g, (_, index: string) => {
    const variableKey = vars[index];
    if (!variableKey) return "";

    const value = templateMapVars[variableKey];
    if (!value) return "";

    return value;
  });
}

export function buildTemplateParams(
  templateVars: Record<string, string>,
  client: Record<string, string>
) {
  return Object.keys(templateVars)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => ({
      type: "text",
      text: client[templateVars[key]] ?? "",
    }));
}

export function validarSelecaoCliente(cliente: Cliente, template?: Template) {
  if (template?.category !== "Cobrança") {
    return true;
  }

  const invoices = cliente.invoices?.list;

  if (!Array.isArray(invoices) || invoices.length === 0) {
    toast.warning(
      `O cliente ${cliente.name} nao possui faturas e nao pode ser selecionado para cobranca.`
    );
    return false;
  }

  const possuiFaturaAberta = invoices.some(
    (inv) => inv.invoice_status === "A Receber"
  );

  if (!possuiFaturaAberta) {
    toast.warning(
      `O cliente ${cliente.name} nao possui faturas em aberto e nao pode ser selecionado para cobranca.`
    );
    return false;
  }

  return true;
}
