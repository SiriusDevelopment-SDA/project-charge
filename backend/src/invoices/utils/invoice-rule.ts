import { InvoiceMapResultDto, InvoiceSearchFilterDto } from '../dto/search.request.dto.invoices';

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim());
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number): string {
  const result = parseIsoDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return formatIsoDate(result);
}

function listDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  while (start.getTime() <= end.getTime()) {
    dates.push(formatIsoDate(start));
    start.setUTCDate(start.getUTCDate() + 1);
  }

  return dates;
}

function getInvoiceRuleInterval(filter: InvoiceSearchFilterDto): {
  daysFrom: number;
  daysTo: number;
} {
  const rawFrom = Number(filter.daysFrom ?? 0);
  const rawTo = Number(filter.daysTo ?? filter.days ?? 0);
  const daysFrom = Math.max(0, Number.isFinite(rawFrom) ? rawFrom : 0);
  const daysTo = Math.max(0, Number.isFinite(rawTo) ? rawTo : 0);

  return daysFrom <= daysTo
    ? { daysFrom, daysTo }
    : { daysFrom: daysTo, daysTo: daysFrom };
}

export function getInvoiceRuleReferenceDates(
  filter?: InvoiceSearchFilterDto,
): string[] {
  if (!filter) return [];

  const values = [
    ...(Array.isArray(filter.referenceDates) ? filter.referenceDates : []),
    filter.referenceDate,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value && isIsoDate(value));

  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function getInvoiceRuleDueDatesForReferenceDate(
  filter: InvoiceSearchFilterDto,
  referenceDate: string,
): string[] {
  const { daysFrom, daysTo } = getInvoiceRuleInterval(filter);

  switch (filter.operator) {
    case 'greater_than':
    case 'greater_or_equal': {
      const startDate = addDays(referenceDate, -daysTo);
      const endDate = addDays(referenceDate, -daysFrom);
      return listDatesBetween(startDate, endDate);
    }

    case 'less_or_equal':
      return [referenceDate];

    case 'less_than':
    default: {
      const startDate = addDays(referenceDate, daysFrom);
      const endDate = addDays(referenceDate, daysTo);
      return listDatesBetween(startDate, endDate);
    }
  }
}

export function getInvoiceRuleDueDatesMap(
  filter: InvoiceSearchFilterDto,
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  getInvoiceRuleReferenceDates(filter).forEach((referenceDate) => {
    map.set(
      referenceDate,
      getInvoiceRuleDueDatesForReferenceDate(filter, referenceDate),
    );
  });

  return map;
}

export function getInvoiceRuleQueryWindow(
  filter?: InvoiceSearchFilterDto,
): { startDate: string; endDate: string } | null {
  if (!filter) return null;

  const allDueDates = [...getInvoiceRuleDueDatesMap(filter).values()].flat();
  if (!allDueDates.length) return null;

  const sortedDates = [...new Set(allDueDates)].sort((a, b) => a.localeCompare(b));

  return {
    startDate: sortedDates[0],
    endDate: sortedDates[sortedDates.length - 1],
  };
}

export function normalizeInvoiceDueDateToIso(
  invoiceDueDate?: string | null,
): string | null {
  const safeValue = String(invoiceDueDate ?? '').trim();
  if (!safeValue) return null;

  if (isIsoDate(safeValue)) {
    return safeValue;
  }

  const match = safeValue.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const normalizedYear =
    year.length === 2 ? String(2000 + Number(year)) : year;

  return `${normalizedYear}-${month}-${day}`;
}

export function filterInvoicesByDueDates(
  invoices: InvoiceMapResultDto[],
  dueDates: string[],
): InvoiceMapResultDto[] {
  if (!dueDates.length) return [];

  const dueDatesSet = new Set(dueDates);

  return invoices.filter((invoice) => {
    const normalizedDueDate = normalizeInvoiceDueDateToIso(
      invoice.invoice_due_date,
    );

    return normalizedDueDate ? dueDatesSet.has(normalizedDueDate) : false;
  });
}
