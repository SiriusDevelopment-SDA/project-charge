const MONEY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function isValidDateParts(day: string, month: string, year: string) {
  const numericDay = Number(day);
  const numericMonth = Number(month);
  const numericYear = Number(year);

  if (
    !Number.isInteger(numericDay) ||
    !Number.isInteger(numericMonth) ||
    !Number.isInteger(numericYear) ||
    numericDay <= 0 ||
    numericMonth <= 0 ||
    numericMonth > 12
  ) {
    return false;
  }

  const date = new Date(numericYear, numericMonth - 1, numericDay);

  return (
    date.getFullYear() === numericYear &&
    date.getMonth() === numericMonth - 1 &&
    date.getDate() === numericDay
  );
}

function expandYear(year: string) {
  if (year.length === 4) return year;
  return String(2000 + Number(year));
}

export function normalizeDateValue(value?: string | null) {
  const input = String(value ?? "").trim();

  if (!input) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split("-");
    return isValidDateParts(day, month, year) ? `${day}/${month}/${year}` : input;
  }

  const parts = input.split(/[^\d]/).filter(Boolean);

  if (parts.length === 3) {
    const [first, second, third] = parts;

    if (first.length === 4) {
      return isValidDateParts(third, second, first)
        ? `${third.padStart(2, "0")}/${second.padStart(2, "0")}/${first}`
        : input;
    }

    const year = expandYear(third);
    const day = first.padStart(2, "0");
    const month = second.padStart(2, "0");

    return isValidDateParts(day, month, year) ? `${day}/${month}/${year}` : input;
  }

  const digits = input.replace(/\D/g, "");

  if (digits.length === 8) {
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);

    return isValidDateParts(day, month, year) ? `${day}/${month}/${year}` : input;
  }

  if (digits.length === 6) {
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = expandYear(digits.slice(4, 6));

    return isValidDateParts(day, month, year) ? `${day}/${month}/${year}` : input;
  }

  return input;
}

export function maskDateInput(value?: string | null) {
  const digits = String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 8);

  if (!digits) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function normalizeCurrencyValue(value?: string | number | null) {
  const input = String(value ?? "").trim();

  if (!input) return "";

  const clean = input.replace(/[R$\s]/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const parsed = Number.parseFloat(normalized);

  if (Number.isNaN(parsed)) {
    return input;
  }

  return MONEY_FORMATTER.format(parsed);
}

export function maskCurrencyInput(value?: string | number | null) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) return "";

  return MONEY_FORMATTER.format(Number(digits) / 100);
}
