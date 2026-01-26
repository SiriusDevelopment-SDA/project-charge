import type { Cliente, Template } from "../types";
import { gerarModeloClientes } from "./gerarModeloPlanilhaClientes";
import { gerarModeloLeads } from "./gerarModeloPlanilhaLeads";
import { toast } from "react-toastify";

export function extrairDocumentosClientes (data: any[]){
  if (!data.every(row => "cnpj_cpf" in row)) {
    throw new Error("Planilha inválida: coluna cnpj_cpf ausente")
  }

  return data
    .map(row => String(row.cnpj_cpf).replace(/\D/g, ""))
    .filter(doc => doc.length === 11 || doc.length === 14)
}
export function extrairLeads(data: any[]){
  if (!data.every(row => "whatsapp" in row)) {
    toast.warning("Planilha de lead inválida: coluna telefone ausente")
  }

  return data
}
export const processarDocumentos = (documents: string[]) => {
  if (documents.length === 0) {
    toast.error("Nenhum CNPJ/CPF válido encontrado")
    return
  }
  toast.success(`${documents.length} documentos processados com sucesso`)
}

export function validarData(valor: string): boolean {
  const d = new Date(valor);
  return !isNaN(d.getTime());
}

export function validarArquivo(file: File) {
  const permitido = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];

  if (!permitido.includes(file.type)) {
    throw new Error('Arquivo inválido. Envie um XLSX.');
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Arquivo muito grande.');
  }
}
export function todasColunasPreenchidas(lead: Record<string, any>) {
  const camposIgnorados = ["status"];

  return Object.entries(lead)
    .filter(([key]) => !camposIgnorados.includes(key))
    .every(([, value]) =>
      value !== "" &&
      value !== null &&
      value !== undefined
    );
}

export function gerarModeloPlanilha(template: Template | null, modo: "clientes" | "leads") {
  if (modo === "clientes") {
    return gerarModeloClientes();
  }
  return gerarModeloLeads(template);
}
export function getTipoPlanilha(fileName: string){
  const name = fileName.toLowerCase()

  if (name.includes("lead")) return "lead"
  if (name.includes("cliente")) return "cliente"

  return "desconhecida"
}

export function compilarTemplate(
  message: string,
  variables: Record<string, string>,
  templateMapVars: Record<string, string>
) {
  
    return message.replace(/{{(\d+)}}/g, (_, index) => {
      const variableKey = variables[index];
      if (!variableKey) return "";

      const varMapped = templateMapVars[variableKey];
      if (!varMapped) return "";

      return varMapped ?? "";
    });
}
export function obterFaturaMaisAntigaAberta(cliente: any) {
  const abertas = filtrarFaturasAbertas(cliente.invoices || []);
  if (abertas.length === 0) return null;

  const ordenadas = ordenarPorVencimento(abertas);
  return ordenadas[0]; // a mais antiga
}

export function filtrarFaturasAbertas(invoices: any[]) {
  return invoices.filter(inv =>
    inv.situacao?.toLowerCase().includes("A Receber")
  );
}
export function ordenarPorVencimento(invoices: any[]) {
  return invoices.sort((a, b) =>
    new Date(a.Data_de_vencimento).getTime() - new Date(b.Data_de_vencimento).getTime()
  );
}
export function validarSelecaoCliente(
  cliente: Cliente,
  template?: Template
) {
  if (template?.category !== "Cobrança") return true;

  const possuiFaturaAberta = cliente.invoices?.some(
    inv => inv.status === "A Receber"
  );

  if (!possuiFaturaAberta) {
    toast.warning(
      `O cliente ${cliente.name} não possui faturas em aberto e não pode ser selecionado para cobrança.`
    );
    return false;
  }

  return true;
}


