type OverdueInvoice = {
  status?: string;
  data_vencimento_fatura?: string;
};

export function calcularDiasVencidos(dataVencimento: string): number {
  const [ano, mes, dia] = dataVencimento.split("-").map(Number);

  const vencimento = new Date(ano, mes - 1, dia);
  const hoje = new Date();

  hoje.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);

  const diff = hoje.getTime() - vencimento.getTime();
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));

  return dias > 0 ? dias : 0;
}

export function faturasVencidas(invoice: OverdueInvoice): boolean {
  if (invoice.status !== "A Receber") return false;

  const dueDate = invoice.data_vencimento_fatura;
  if (!dueDate) return false;

  const hoje = new Date();
  const vencimento = new Date(`${dueDate}T00:00:00`);

  return vencimento < hoje;
}

export function maiorAtrasoCliente(invoices: OverdueInvoice[]): number {
  const vencidas = invoices.filter(faturasVencidas);
  if (vencidas.length === 0) return 0;

  return Math.max(
    ...vencidas.map((invoice) =>
      calcularDiasVencidos(String(invoice.data_vencimento_fatura ?? ""))
    )
  );
}
