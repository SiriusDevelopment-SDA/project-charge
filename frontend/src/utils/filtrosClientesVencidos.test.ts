import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  calcularDiasVencidos,
  calcularDividaCliente,
  faturasVencidas,
  maiorAtrasoCliente,
} from './filtrosClientesVencidos';

describe('filtrosClientesVencidos utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 9, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calcula dias vencidos e protege datas inválidas', () => {
    expect(calcularDiasVencidos('05/03/2026')).toBe(4);
    expect(calcularDiasVencidos('15/03/2026')).toBe(0);
    expect(calcularDiasVencidos('data-invalida')).toBe(0);
  });

  it('identifica corretamente se uma fatura está vencida', () => {
    expect(faturasVencidas({ invoice_due_date: '08/03/2026' })).toBe(true);
    expect(faturasVencidas({ invoice_due_date: '09/03/2026' })).toBe(false);
    expect(faturasVencidas({ invoice_due_date: '2026-03-09' })).toBe(false);
    expect(faturasVencidas({})).toBe(false);
  });

  it('retorna maior atraso entre faturas vencidas', () => {
    const invoices = [
      { invoice_due_date: '08/03/2026' },
      { invoice_due_date: '05/03/2026' },
      { invoice_due_date: '12/03/2026' },
    ];

    expect(maiorAtrasoCliente(invoices)).toBe(4);
  });

  it('soma apenas valores numéricos de faturas vencidas', () => {
    const invoices = [
      { invoice_due_date: '01/03/2026', invoice_amount: '10.5' },
      { invoice_due_date: '02/03/2026', invoice_amount: 20 },
      { invoice_due_date: '12/03/2026', invoice_amount: 99 },
      { invoice_due_date: '03/03/2026', invoice_amount: 'valor-invalido' },
    ];

    expect(calcularDividaCliente(invoices)).toBeCloseTo(30.5);
    expect(calcularDividaCliente([])).toBe(0);
  });
});
