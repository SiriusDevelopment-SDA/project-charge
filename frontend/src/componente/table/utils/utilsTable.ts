
 /* ================= TRADUÇÃO DE STATUS ================= */
  export const traduzirStatus = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DELIVERED":
        return "Entregue";
      case "READ":
        return "Lido";
      case "SENT":
        return "Enviado";
      case "QUEUED":
        return "Em fila";
      case "ERROR":
        return "Erro";
      default:
        return status || "-";
    }
  };

 export  const statusSeverity = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DELIVERED":
        return "success";
      case "READ":
        return "info";
      case "SENT":
        return "warning";
      case "QUEUED":
        return "secondary";
      case "ERROR":
        return "danger";
      default:
        return "secondary";
    }
  };

