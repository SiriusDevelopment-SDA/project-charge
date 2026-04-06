/* ================= TRADUCAO DE STATUS ================= */
export const traduzirStatus = (status: string) => {
  const normalized = String(status ?? '').trim().toLowerCase();

  switch (normalized) {
    case 'delivered':
      return 'Entregue';
    case 'read':
      return 'Lido';
    case 'sent':
      return 'Enviado';
    case 'queued':
      return 'Em fila';
    case 'pending':
      return 'Pendente';
    case 'failed':
      return 'Falhou';
    case 'error':
      return 'Erro';
    case 'skipped':
      return 'Não enviado (Fatura indisponível)';
    default:
      return status || '-';
  }
};

export const statusSeverity = (status: string) => {
  const normalized = String(status ?? '').trim().toLowerCase();

  switch (normalized) {
    case 'delivered':
      return 'success';
    case 'read':
      return 'info';
    case 'sent':
      return 'warning';
    case 'queued':
      return 'secondary';
    case 'pending':
      return 'secondary';
    case 'failed':
      return 'danger';
    case 'error':
      return 'danger';
    case 'skipped':
      return 'warning';
    default:
      return 'secondary';
  }
};
