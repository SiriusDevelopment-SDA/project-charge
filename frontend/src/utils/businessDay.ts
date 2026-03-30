function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isHoliday(date: Date, holidays: string[]): boolean {
  return holidays.includes(toDateKey(date));
}

export function isBusinessDay(date: Date, holidays: string[]): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

export function filterBusinessDays(dateKeys: string[], holidays: string[]): string[] {
  return dateKeys.filter((key) => {
    const date = new Date(`${key}T12:00:00`);
    return isBusinessDay(date, holidays);
  });
}
