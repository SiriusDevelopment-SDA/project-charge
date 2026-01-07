import { addLocale, locale } from "primereact/api";

addLocale("pt", {
  // Filtros
  matchAll: "Corresponder a todos",
  matchAny: "Corresponder a qualquer",
  addRule: "Adicionar regra",
  removeRule: "Remover regra",
  apply: "Aplicar",
  clear: "Limpar",

  // Operadores
  startsWith: "Começa com",
  contains: "Contém",
  notContains: "Não contém",
  endsWith: "Termina com",
  equals: "Igual",
  notEquals: "Diferente",
  noFilter: "Sem filtro",

  // Datas
  dateIs: "Data é",
  dateIsNot: "Data não é",
  dateBefore: "Data antes de",
  dateAfter: "Data depois de",

  // Gerais
  emptyFilterMessage: "Nenhuma opção disponível",
  emptyMessage: "Nenhum registro encontrado",
  searchMessage: "Pesquisar",
  selectionMessage: "{0} itens selecionados",
  emptySelectionMessage: "Nenhum item selecionado",
  emptySearchMessage: "Nenhum resultado encontrado",

  // Calendário
  dayNames: ["domingo","segunda","terça","quarta","quinta","sexta","sábado"],
  dayNamesShort: ["dom","seg","ter","qua","qui","sex","sáb"],
  dayNamesMin: ["D","S","T","Q","Q","S","S"],
  monthNames: [
    "janeiro","fevereiro","março","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro"
  ],
  monthNamesShort: [
    "jan","fev","mar","abr","mai","jun",
    "jul","ago","set","out","nov","dez"
  ],
  today: "Hoje",
  weekHeader: "Sem",
});

locale("pt");
