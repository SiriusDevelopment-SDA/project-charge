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

/**
 * Remove tudo que não é dígito de um telefone.
 * Ex.: "+55 (11) 99895-0080" -> "5511998950080".
 */
export function phoneDigits(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '');
}

/**
 * Retorna o "telefone local" (DDD + assinante) removendo o prefixo de país
 * brasileiro (55) quando presente.
 *
 * Brasileiro: 55 (país) + 2 (DDD) + 8/9 (assinante) => 12/13 dígitos com país,
 * 10/11 sem país. Só removemos o 55 quando o resto continua com tamanho de
 * telefone local plausível (>= 10), para nunca confundir com um DDD que comece
 * por 55 ou com números curtos.
 */
export function localPhoneDigits(phone: string | null | undefined): string {
  const digits = phoneDigits(phone);
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits.slice(2);
  }
  return digits;
}

/**
 * Compara dois telefones tolerando a presença/ausência do código de país (55)
 * e formatação. Casa "5511998950080" com "11998950080".
 *
 * Para evitar falso-positivo, exige que o sufixo comum tenha >= 10 dígitos
 * (DDD + assinante). Números mais curtos só casam por igualdade exata.
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const la = localPhoneDigits(a);
  const lb = localPhoneDigits(b);
  if (!la || !lb) return false;
  if (la === lb) return true;

  const len = Math.min(la.length, lb.length);
  if (len < 10) return false;

  return la.slice(-len) === lb.slice(-len);
}
