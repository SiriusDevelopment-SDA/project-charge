export function formatDateBR(date?: string | Date | null) {
    if (!date) return "—";
  
    const d = new Date(date);
  
    return d.toLocaleDateString("pt-BR");
  }
export function formatDateInput(date?: string) {
    if (!date) return "";
    const d = new Date(date);
    return d.toISOString().split("T")[0];
  }