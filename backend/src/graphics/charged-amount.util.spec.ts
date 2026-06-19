import { extractChargedAmount, parseChargedValue } from './charged-amount.util';

describe('parseChargedValue', () => {
  it('reconhece valor com ponto decimal simples ("61.11")', () => {
    expect(parseChargedValue('61.11')).toBe(61.11);
  });

  it('reconhece valor BR com milhar e vírgula decimal ("1.234,56")', () => {
    expect(parseChargedValue('1.234,56')).toBe(1234.56);
  });

  it('reconhece valor BR sem milhar ("120,00")', () => {
    expect(parseChargedValue('120,00')).toBe(120);
  });

  it('ignora prefixo "R$" e espaços', () => {
    expect(parseChargedValue('R$ 1.500,90')).toBe(1500.9);
  });

  it('rejeita datas (contêm "/")', () => {
    expect(parseChargedValue('20/04/26')).toBeNull();
    expect(parseChargedValue('20/04/2026')).toBeNull();
  });

  it('rejeita nomes e texto livre', () => {
    expect(parseChargedValue('MARIA')).toBeNull();
    expect(parseChargedValue('SAMARA SILVA DE LIMA')).toBeNull();
  });

  it('rejeita inteiros sem casas decimais (evita confundir CPF/parcela com moeda)', () => {
    expect(parseChargedValue('61')).toBeNull();
    expect(parseChargedValue('2024')).toBeNull();
  });

  it('rejeita não-strings', () => {
    expect(parseChargedValue(null)).toBeNull();
    expect(parseChargedValue(undefined)).toBeNull();
    expect(parseChargedValue(61.11)).toBeNull();
  });
});

describe('extractChargedAmount', () => {
  it('extrai o valor de um array de sucesso ["NOME","DATA","61.11"]', () => {
    expect(extractChargedAmount(['JOÃO', '20/04/26', '61.11'])).toBe(61.11);
  });

  it('extrai o MAIOR valor monetário quando há mais de um', () => {
    expect(extractChargedAmount(['NOME', '120,00', '1.500,90'])).toBe(1500.9);
  });

  it('extrai dos `components` dentro do objeto de erro', () => {
    expect(
      extractChargedAmount({
        error: { http_status: 200, notificame_response: {} },
        components: ['MARIA', '99,90'],
      }),
    ).toBe(99.9);
  });

  it('retorna 0 quando objeto de erro só tem nome (sem valor)', () => {
    expect(
      extractChargedAmount({
        error: { http_status: 429, notificame_response: {} },
        components: ['MARIA'],
      }),
    ).toBe(0);
  });

  it('retorna 0 para template estático sem variáveis ({} ou [])', () => {
    expect(extractChargedAmount({})).toBe(0);
    expect(extractChargedAmount([])).toBe(0);
  });

  it('retorna 0 para entradas inválidas', () => {
    expect(extractChargedAmount(null)).toBe(0);
    expect(extractChargedAmount(undefined)).toBe(0);
    expect(extractChargedAmount('texto solto')).toBe(0);
  });
});
