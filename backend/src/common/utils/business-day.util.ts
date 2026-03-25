/**
 * Calcula a data da Páscoa pelo algoritmo Gregoriano Anônimo.
 */
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildNationalHolidays(year: number): Set<string> {
  const easter = getEasterDate(year);
  const holidays = new Set<string>();

  // Feriados nacionais fixos
  holidays.add(`${year}-01-01`); // Confraternização Universal
  holidays.add(`${year}-04-21`); // Tiradentes
  holidays.add(`${year}-05-01`); // Dia do Trabalho
  holidays.add(`${year}-09-07`); // Independência do Brasil
  holidays.add(`${year}-10-12`); // Nossa Senhora Aparecida
  holidays.add(`${year}-11-02`); // Finados
  holidays.add(`${year}-11-15`); // Proclamação da República
  holidays.add(`${year}-12-25`); // Natal

  // Feriados móveis baseados na Páscoa
  holidays.add(toDateStr(addDays(easter, -48))); // Segunda de Carnaval
  holidays.add(toDateStr(addDays(easter, -47))); // Terça de Carnaval
  holidays.add(toDateStr(addDays(easter, -2)));  // Sexta-feira Santa
  holidays.add(toDateStr(easter));               // Páscoa
  holidays.add(toDateStr(addDays(easter, 60)));  // Corpus Christi

  return holidays;
}

const holidayCache = new Map<number, Set<string>>();

function getHolidaysForYear(year: number): Set<string> {
  if (!holidayCache.has(year)) {
    holidayCache.set(year, buildNationalHolidays(year));
  }
  return holidayCache.get(year)!;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isNationalHoliday(date: Date): boolean {
  const dateStr = toDateStr(date);
  const year = date.getFullYear();
  return getHolidaysForYear(year).has(dateStr);
}

/**
 * Retorna true se a data for um dia útil (não é fim de semana nem feriado nacional).
 */
export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isNationalHoliday(date);
}
