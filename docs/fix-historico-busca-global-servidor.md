# Fix — Histórico de disparos: busca global passa a filtrar o conjunto inteiro

## Problema
Na tela **Histórico de disparos**, a "Busca global" filtrava **apenas as linhas da
página atual** (filtro client-side do PrimeReact sobre as 50 linhas carregadas).
Com a paginação vinda do servidor SEM o filtro, os resultados de uma busca ficavam
**espalhados pelas páginas**: a página 1 mostrava 3 resultados, e era preciso
navegar até a página 2 para ver o resto — com o contador de páginas ainda
refletindo o total sem filtro (ex.: "1/5").

## Causa
Duas metades que nunca foram ligadas:
- `useHistorico` já enviava `query` ao backend (e resetava para a página 1 ao
  mudar), mas **nenhuma tela chamava o `setQuery`**.
- O backend (`POST /templates/reports/search`) **já filtrava** por `query`
  (`name ILIKE` / `number ILIKE`) sobre o conjunto inteiro e devolvia o `total`
  filtrado — recurso pronto e sem uso.
- A caixa de busca da tabela usava só o filtro global client-side do PrimeReact
  (página atual).

## Correção (100% frontend, sem mudança de backend)
- `useHistorico`: `setQuery` ganhou **debounce interno (400ms)** — evita uma
  requisição por tecla.
- `useHistoryTableController`: aceita `onSearch` e repassa o valor digitado;
  o filtro global client-side foi **removido** (era o causador do bug).
  "Limpar filtros" também limpa a busca do servidor.
- `tableHistory`: prop nova `onSearch`; placeholder vira **"Buscar cliente ou
  número..."** (deixa claro o alcance da busca no servidor); `globalFilterFields`
  removido.
- `historico-disparo.tsx`: liga `setQuery` do `useHistorico` na tabela.
- Tipo `IHistoricoContext.setQuery` ajustado para `(value: string) => void`.

## Comportamento novo
Digitou na busca → espera 400ms → backend devolve TODOS os que casam, paginados
de 50 em 50 a partir da **página 1** — "acumula tudo que der na primeira página,
e cria a segunda se não couber". O contador de páginas passa a refletir o total
**do filtro**. Respeita o escopo atual (manual/campanhas/lote).

## Limitação conhecida (fora do escopo)
Os filtros **por coluna** (Cliente, Número, Data, Status, Resposta — ícones de
funil) continuam client-side, ou seja, filtram só a página atual. Se preciso,
vira demanda separada (backend precisaria aceitar filtros por campo).

## Validação
- `npx tsc --noEmit` OK no frontend.
- Backend intocado.
