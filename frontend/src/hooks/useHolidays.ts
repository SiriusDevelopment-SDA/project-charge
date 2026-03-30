import { useEffect, useState } from "react";

const CACHE_PREFIX = "br_holidays_";

async function fetchHolidaysForYear(year: number): Promise<string[]> {
  const cacheKey = `${CACHE_PREFIX}${year}`;

  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as string[];
  } catch {
    // sessionStorage unavailable, proceed without cache
  }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
    if (!res.ok) return [];

    const data = (await res.json()) as { date: string }[];
    const dates = data.map((h) => h.date);

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(dates));
    } catch {
      // quota exceeded, ignore
    }

    return dates;
  } catch {
    return [];
  }
}

/**
 * Retorna lista de feriados nacionais brasileiros (ano atual + próximo)
 * no formato "YYYY-MM-DD". Falha silenciosamente se a API estiver indisponível.
 */
export function useHolidays(): string[] {
  const [holidays, setHolidays] = useState<string[]>([]);

  useEffect(() => {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    void Promise.all([
      fetchHolidaysForYear(currentYear),
      fetchHolidaysForYear(nextYear),
    ]).then(([current, next]) => {
      setHolidays([...current, ...next]);
    });
  }, []);

  return holidays;
}
