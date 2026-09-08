import { parseAmountToCents } from "../mappers/templateVars.mapper";
function parseDataBR(data: string): Date | null {
  const safeDate = String(data).replace(/\s/g, "").trim();
  const match = safeDate.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return null;

  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const anoBruto = Number(match[3]);
  if (!dia || !mes || !anoBruto) return null;

  const ano = match[3].length === 2 ? 2000 + anoBruto : anoBruto;
  const parsed = new Date(ano, mes - 1, dia);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function calcularDiasVencidos(dataVencimento: string): number {
  const vencimento = parseDataBR(dataVencimento);
  if (!vencimento) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);
  const diff = hoje.getTime() - vencimento.getTime();
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  return dias > 0 ? dias : 0;
}

// Retorna dias relativos ao dia atual:
// positivo  = invoice está no futuro (a vencer)
// negativo  = invoice está no passado (vencida)
// 0         = vence hoje
export function calcularDiasRelativosHoje(invoice_due_date: string): number {
  const vencimento = parseDataBR(invoice_due_date);
  if (!vencimento) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);
  return Math.round((vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

export function faturasVencidas(invoice: any): boolean {
  if (!invoice.invoice_due_date) return false;
  const vencimento = parseDataBR(invoice.invoice_due_date);
  if (!vencimento) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);
  return vencimento < hoje;
}

export function maiorAtrasoCliente(invoices: any[]): number {
  const vencidas = invoices.filter(faturasVencidas);
  if (vencidas.length === 0) return 0;
  const dias = vencidas.map(inv => calcularDiasVencidos(inv.invoice_due_date));
  return Math.max(...dias);
}

/**
 * Soma das faturas vencidas do cliente, em reais.
 *
 * `Number()` so entende ponto decimal. Hoje os quatro ERPs mandam ponto ou
 * inteiro — 91.034 faturas conferidas no banco, zero com virgula — entao a
 * conta esta certa. O problema e o que acontece se isso mudar: com o guarda
 * `Number.isFinite`, uma fatura "1.234,56" nao viraria `NaN` na tela, viraria
 * ZERO na soma. A divida apareceria menor, sem erro, sem log, sem sintoma.
 *
 * `parseAmountToCents` le os dois formatos, entao a conta para de depender de
 * qual ERP respondeu. E paliativo consciente: no F12 a divida passa a vir
 * calculada do servidor e esta funcao morre.
 */
export function calcularDividaCliente(invoices: any[]): number {
  if (!invoices?.length) return 0;
  return invoices
    .filter(faturasVencidas)
    .reduce((total, invoice) => total + parseAmountToCents(invoice.invoice_amount) / 100, 0);
}

// Verifica se o cliente tem alguma fatura cujo vencimento está dentro do range [left, right]
// onde negativo = vencida, positivo = a vencer, 0 = vence hoje
export function clienteNaRegua(invoices: any[], range: [number, number]): boolean {
  const [left, right] = range;
  if (left === 0 && right === 0) return false;
  return invoices.some((inv) => {
    if (!inv.invoice_due_date) return false;
    const dias = calcularDiasRelativosHoje(inv.invoice_due_date);
    return dias >= left && dias <= right;
  });
}
