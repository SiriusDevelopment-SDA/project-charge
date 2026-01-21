import type { Cliente, Template } from "../types";
import { gerarModeloClientes } from "./gerarModeloPlanilhaClientes";
import { gerarModeloLeads } from "./gerarModeloPlanilhaLeads";
import { toast } from "react-toastify";

export function validarTelefone(valor: string): boolean {
  const numeric = valor.replace(/\D/g, "");
  return numeric.length >= 10 && numeric.length <= 14;
}

export function validarEmail(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email);
}

export function validarCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, "");
  if (cleaned.length !== 11) return false;
  if (/^(\d)\1+$/.test(cleaned)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += +cleaned[i] * (10 - i);
  let resto = 11 - (soma % 11);
  resto = resto >= 10 ? 0 : resto;
  if (resto !== +cleaned[9]) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += +cleaned[i] * (11 - i);
  resto = 11 - (soma % 11);
  resto = resto >= 10 ? 0 : resto;
  return resto === +cleaned[10];
}

export function validarCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, "");
  if (cleaned.length !== 14) return false;

  let size = cleaned.length - 2;
  let numbers = cleaned.substring(0, size);
  const digits = cleaned.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += +numbers[size - i] * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== +digits[0]) return false;

  size++;
  numbers = cleaned.substring(0, size);
  sum = 0;
  pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += +numbers[size - i] * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === +digits[1];
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

export function gerarModeloPlanilha(template: Template | null, modo: "clientes" | "leads") {
  if (modo === "clientes") {
    return gerarModeloClientes();
  }
  return gerarModeloLeads(template);
}

export function processarLeads(dados: any[]) {
  return dados.map(row => {
    const contato = row.contato?.toString().trim();
    const status =
      validarTelefone(contato) || validarEmail(contato)
        ? "válido"
        : "inválido";

    return { ...row, status };
  });
}

// NOVO → unifica CPF/CNPJ
export function validarCpfCnpj(valor: string): boolean {
  const cleaned = (valor || "").replace(/\D/g, "");
  if (cleaned.length === 11) return validarCPF(cleaned);
  if (cleaned.length === 14) return validarCNPJ(cleaned);
  return false;
}

// CORRIGIDO
export function validar(rows: any[]) {
  const erros: string[] = [];

  rows.forEach((row, index) => {
    const linha = index + 2;

    if (!validarCpfCnpj(row.cnpj_cpf)) {
      erros.push(`Linha ${linha}: CPF/CNPJ inválido`);
    }

    if (!["valido", "invalido", "erro"].includes((row.status || "").toLowerCase())) {
      erros.push(`Linha ${linha}: status inválido`);
    }
  });

  if (erros.length > 0) {
    console.table(erros);
    return { valido: false, erros };
  }

  return { valido: true };
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


