import { localPhoneDigits, phoneDigits, phonesMatch } from './index';

describe('phoneDigits', () => {
  it('remove tudo que não é dígito', () => {
    expect(phoneDigits('+55 (11) 99895-0080')).toBe('5511998950080');
  });

  it('trata null/undefined como string vazia', () => {
    expect(phoneDigits(null)).toBe('');
    expect(phoneDigits(undefined)).toBe('');
  });
});

describe('localPhoneDigits', () => {
  it('remove o prefixo de país 55 quando o número tem >= 12 dígitos', () => {
    expect(localPhoneDigits('5511998950080')).toBe('11998950080');
  });

  it('mantém o número quando já é local (sem 55)', () => {
    expect(localPhoneDigits('11998950080')).toBe('11998950080');
  });

  it('NÃO remove 55 de números curtos (evita confundir com DDD)', () => {
    // "5599999" tem só 7 dígitos -> não é telefone BR com país.
    expect(localPhoneDigits('5599999')).toBe('5599999');
  });
});

describe('phonesMatch', () => {
  it('casa o mesmo número com e sem o prefixo 55 (o bug da PROXER)', () => {
    expect(phonesMatch('5511998950080', '11998950080')).toBe(true);
    expect(phonesMatch('11998950080', '5511998950080')).toBe(true);
  });

  it('casa formatação diferente', () => {
    expect(phonesMatch('+55 (11) 99895-0080', '11998950080')).toBe(true);
  });

  it('NÃO casa números de DDDs diferentes', () => {
    expect(phonesMatch('5511998950080', '5521998950080')).toBe(false);
  });

  it('NÃO casa assinantes diferentes no mesmo DDD', () => {
    expect(phonesMatch('11998950080', '11998950081')).toBe(false);
  });

  it('NÃO casa números curtos por sufixo (evita falso-positivo)', () => {
    expect(phonesMatch('1234', '91234')).toBe(false);
  });

  it('retorna false quando algum lado é vazio', () => {
    expect(phonesMatch('', '11998950080')).toBe(false);
    expect(phonesMatch('11998950080', null)).toBe(false);
  });
});
