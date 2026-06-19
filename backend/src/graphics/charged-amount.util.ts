/**
 * Extração ROBUSTA do "valor cobrado" embutido em `components_maped` (jsonb) de
 * um disparo (RelatoryDispatchTemplate).
 *
 * NÃO há FK relatory -> invoice, então o valor que aparece na tela de gráficos é
 * o mesmo que o cliente VIU na mensagem: ele vive como uma das variáveis
 * mapeadas do template. Formatos observados em produção:
 *
 *   - Array (sucesso, histórico):            ["NOME","20/04/26","61.11"]
 *   - Objeto de erro (worker novo):          {"error":{...},"components":["MARIA"]}
 *   - Objeto/array vazio (template estático): {}  ou  []
 *
 * Estratégia: varremos todos os valores string (array direto OU `components`
 * dentro do objeto de erro), identificamos quais parecem MONETÁRIOS (BR
 * "1.234,56" ou "61.11"), ignoramos datas (têm "/") e nomes, e usamos o MAIOR
 * candidato como o valor cobrado daquele disparo. Sem candidato => 0.
 */

// "1.234,56" / "1234,56" (BR, vírgula decimal, ponto de milhar opcional)
const BR_MONEY = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
// "61.11" / "1234.56" (ponto decimal simples, sem milhar)
const DOT_MONEY = /^\d+\.\d{2}$/;

/**
 * Converte uma string monetária reconhecida em número. Retorna `null` quando a
 * string não casa com nenhum formato monetário conhecido, é uma data (tem "/")
 * ou é texto livre (nome).
 */
export function parseChargedValue(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;

  // Normaliza: remove prefixo "R$", espaços e caracteres invisíveis.
  const s = raw.replace(/r\$/i, '').replace(/\s/g, '').trim();
  if (!s) return null;

  // Datas (20/04/26, 20/04/2026) nunca são valor.
  if (s.includes('/')) return null;

  if (BR_MONEY.test(s)) {
    // "1.234,56" -> 1234.56
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  if (DOT_MONEY.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

/**
 * Coleta os valores string candidatos de um `components_maped`, lidando com as
 * três formas conhecidas (array direto, objeto com `components`, vazio).
 */
function collectStrings(componentsMaped: unknown): string[] {
  if (Array.isArray(componentsMaped)) {
    return componentsMaped.filter((v): v is string => typeof v === 'string');
  }

  if (componentsMaped && typeof componentsMaped === 'object') {
    const inner = (componentsMaped as { components?: unknown }).components;
    if (Array.isArray(inner)) {
      return inner.filter((v): v is string => typeof v === 'string');
    }
  }

  return [];
}

/**
 * Extrai o valor cobrado de UM disparo. Retorna o MAIOR valor monetário
 * encontrado entre as variáveis mapeadas, ou 0 quando nenhum casa (template
 * sem valor / estático).
 */
export function extractChargedAmount(componentsMaped: unknown): number {
  let max = 0;
  for (const candidate of collectStrings(componentsMaped)) {
    const value = parseChargedValue(candidate);
    if (value !== null && value > max) max = value;
  }
  return max;
}
