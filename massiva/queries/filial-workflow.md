# Direct lan — aplicar filial_id no workflow (checklist)

Deixa a Direct lan **self-contained** (para de usar os webhooks da Hex) e faz
todos os nós separarem por `(account, filial_id)`. Pré-requisito: rodar
`queries/filial.sql` no banco (já feito).

## Parte 1 — Colar os 3 arquivos (dist/directlan/)
- **`HTML2`** (nó generateHtmlTemplate) ← `massiva.html`
- **Respond do `css_directlan`** (Respond to Webhook) ← `massiva.css`
- **Respond do `js-directlan`** (Respond to Webhook) ← `massiva.js`

Esses já vêm com os paths `-directlan`, os placeholders `$('directlan')` e o
`filial_id` (elemento `#filial`).

## Parte 2 — Adicionar filial_id nos nós Postgres
Credencial de todos continua **BANCO IA_N8N**. Só muda Query + Query Parameters.

### `Busca os dados dos endereços` (catálogo · ler)
```sql
SELECT COALESCE(json_agg(json_build_object(
  'id', id, 'tipo', tipo, 'nome', nome, 'texto', texto, 'pai_id', pai_id
) ORDER BY criado_em), '[]') AS dados
FROM public.massiva_catalogo
WHERE account = $1
  AND filial_id = COALESCE(NULLIF($2,''), '1')
  AND deletado_em IS NULL;
```
Query Parameters: `{{ [$json.query.account, $json.query.filial_id] }}`

### `salva os dados dos endereços` (catálogo · criar)
```sql
INSERT INTO public.massiva_catalogo (account, filial_id, tipo, nome, texto, pai_id, criado_por)
VALUES ($1, COALESCE(NULLIF($2,''), '1'), $3, $4, $5, $6, $7)
RETURNING id, tipo, nome, texto, pai_id;
```
Query Parameters: `{{ [$json.body.account, $json.body.filial_id, $json.body.tipo, $json.body.nome, $json.body.texto, $json.body.pai_id, $json.body.token] }}`

### `exclui` (catálogo · excluir)
```sql
WITH RECURSIVE sub AS (
  SELECT id FROM public.massiva_catalogo
   WHERE account = $1 AND filial_id = COALESCE(NULLIF($4,''), '1') AND id = $2::bigint
  UNION ALL
  SELECT c.id FROM public.massiva_catalogo c JOIN sub ON c.pai_id = sub.id
)
UPDATE public.massiva_catalogo m
   SET deletado_por = $3, deletado_em = now()
 WHERE m.account = $1
   AND m.filial_id = COALESCE(NULLIF($4,''), '1')
   AND m.id IN (SELECT id FROM sub)
   AND m.deletado_em IS NULL
RETURNING m.id;
```
Query Parameters: `{{ [$json.body.account, $json.body.id, $json.body.token, $json.body.filial_id] }}`

### `atualiza botão historico1` (histórico · ler)
```sql
SELECT COALESCE(json_agg(json_build_object(
  'ativado_em', ativado_em, 'desativado_em', desativado_em,
  'duracao_segundos', duracao_segundos, 'mensagem', mensagem,
  'regiao', regiao, 'operador_nome', operador_nome
) ORDER BY ativado_em DESC), '[]') AS historico
FROM public.massiva_historico
WHERE account = $1
  AND filial_id = COALESCE(NULLIF($2,''), '1');
```
Query Parameters: `{{ [$json.query.account, $json.query.filial_id] }}`

### `dados histórico2` (histórico · inserir — mapa de colunas)
Adicionar a coluna **`filial_id`** com valor:
`{{ $('directlan3').item.json.body.filial_id }}`

### `Fechar Histórico1` (desativar)
```sql
UPDATE public.massiva_historico
   SET desativado_em = now()   -- duracao_segundos e coluna GERADA: o banco calcula sozinho
 WHERE account = $1
   AND filial_id = COALESCE(NULLIF($2,''), '1')
   AND desativado_em IS NULL;
```
Query Parameters: `{{ [$('directlan3').item.json.body.account, $('directlan3').item.json.body.filial_id] }}`

> Se existir um nó **"Encerrar anteriores"** na saída TRUE do If, use a MESMA
> query e params acima. Se não existir, adicione um (é o que garante 1 massiva
> ativa por filial — encerra a anterior ao ativar a nova).

### `Select rows from a table1` (status "no ar" · ler na página)
No **where** adicione uma 2ª condição (mantendo a de account):
`filial_id` **Equal** `{{ $json.query.filial_id }}`

### `Update rows in a table1` (status · gravar ao ativar/desativar)
- Em **Values to Send** adicione a coluna `filial_id` = `{{ $json.body.filial_id }}`
- Em **Matching Columns** marque **account E filial_id** (hoje é só account).

*(O nó `Execute a SQL query` — nome do operador — não muda: usa só o token.)*

## Parte 3 — Depois de testar: desativar a Hex
Com a Direct lan self-contained, a Hex vira redundante. Desative o workflow
**MODO MASSIVA - Hex Telecom**.

## Parte 4 — Testar as duas filiais
1. Abrir com `...massiva_directlan?account=21&token=...&filial_id=1` → cadastrar
   uma cidade "SÓ FILIAL 1", ativar uma massiva.
2. Abrir com `...&filial_id=2` → o catálogo e o histórico devem vir **VAZIOS**
   (não pode aparecer nada da filial 1). Cadastrar "SÓ FILIAL 2".
3. Voltar pra filial 1 → deve ver só o dela. Confirmar no banco:
   `SELECT filial_id, count(*) FROM public.massiva_catalogo WHERE account='21' GROUP BY filial_id;`
