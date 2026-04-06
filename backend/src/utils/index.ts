export function formatarDataBR(data: string | undefined | null): string | null {
    if (!data) return null;
    const [ano, mes, dia] = data.split('-');
    if (!ano || !mes || !dia) return null;
    return `${dia}/${mes}/${ano.slice(2)}`;
  }
export const formatDateLocal2 = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  