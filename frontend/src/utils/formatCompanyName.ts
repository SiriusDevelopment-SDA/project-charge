/**
 * Formata o nome da empresa apenas para EXIBICAO.
 *
 * Os nomes chegam do banco com underscore (ex.: "SHIELD_TELECOM").
 * Aqui trocamos "_" por espaco para mostrar "SHIELD TELECOM".
 *
 * IMPORTANTE: usar somente em texto exibido. Nunca em ids, keys ou
 * comparacoes — o valor original continua sendo a fonte da verdade.
 */
export function formatCompanyName(name: string): string {
  return name.replace(/_/g, " ");
}
