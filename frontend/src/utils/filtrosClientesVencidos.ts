type OverdueInvoice = {
  status?: string;
  data_vencimento_fatura?: string;
};

export function calcularDiasVencidos(dataVencimento: string): number {

  const safeDate = String(dataVencimento)
    .replace(/\s/g, '')
    .trim();

  const parts = safeDate.split('/');

  const dia = Number(parts[0]);
  const mes = Number(parts[1]);
  const ano = Number(parts[2]);

  console.log("SAFE:", safeDate);
  console.log("PARSE:", { dia, mes, ano });

  if (!dia || !mes || !ano) {
    console.log("DATA QUEBRADA 🚨");
    return 0;
  }

  const vencimento = new Date(ano, mes - 1, dia);
  const hoje = new Date();

  hoje.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);

  const diff = hoje.getTime() - vencimento.getTime();
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));

  return dias > 0 ? dias : 0;
}

export function faturasVencidas(invoice: any): boolean {
  if (!invoice.invoice_due_date) return false;

  const dataLimpa = invoice.invoice_due_date.trim();

  console.log("DATA LIMPA:", dataLimpa);

  const match = dataLimpa.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    console.warn("FORMATO INVÁLIDO:", dataLimpa);
    return false;
  }

  const [, dia, mes, ano] = match.map(Number);

  const hoje = new Date();
  const vencimento = new Date(ano, mes - 1, dia);

  hoje.setHours(0,0,0,0);
  vencimento.setHours(0,0,0,0);

  const vencida = vencimento < hoje;

  console.log("CHECK FINAL:", {
    hoje,
    vencimento,
    vencida
  });

  return vencida;
}

export function maiorAtrasoCliente(invoices: any[]): number {

  console.log("INVOICES RECEBIDAS:", invoices);

  const vencidas = invoices.filter(faturasVencidas);

  console.log("FATURAS VENCIDAS:", vencidas);

  if (vencidas.length === 0) return 0;

  const dias = vencidas.map(inv => calcularDiasVencidos(inv.invoice_due_date));

  console.log("DIAS CALCULADOS:", dias);

  return Math.max(...dias);
}

export function calcularDividaCliente(invoices: any[]): number {

   if (!invoices?.length) return 0;

   return invoices
      .filter(faturasVencidas)
      .reduce((total, invoice) => {

         const valor = Number(invoice.invoice_amount);

         console.log("VALOR ORIGINAL:", invoice.invoice_amount);
         console.log("VALOR NUMERO:", valor);

         return total + (Number.isFinite(valor) ? valor : 0);

      }, 0);
}