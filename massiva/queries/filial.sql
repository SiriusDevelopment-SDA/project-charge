-- ============================================================================
-- Multi-filial na MESMA conta — separa os dados por (account, filial_id)
-- ----------------------------------------------------------------------------
-- Contexto: duas empresas (filiais) dentro da MESMA conta Chatwoot
-- (ex.: account 21, filial_id 1 e 2). Antes tudo era separado só por `account`;
-- agora entra a coluna `filial_id`.
--
-- DEFAULT '1': toda conta de filial ÚNICA (as outras empresas) continua
-- funcionando SEM enviar nada — cai na filial 1 automaticamente. Só contas
-- multi-filial mandam filial_id = 1, 2, ... na URL/nos webhooks.
--
-- Rode UMA vez no banco n8n_utils (schema public).
-- ============================================================================

-- 1) CATÁLOGO -----------------------------------------------------------------
ALTER TABLE public.massiva_catalogo
    ADD COLUMN IF NOT EXISTS filial_id TEXT NOT NULL DEFAULT '1';
CREATE INDEX IF NOT EXISTS idx_massiva_catalogo_acc_filial_tipo
    ON public.massiva_catalogo (account, filial_id, tipo);

-- 2) HISTÓRICO ----------------------------------------------------------------
ALTER TABLE public.massiva_historico
    ADD COLUMN IF NOT EXISTS filial_id TEXT NOT NULL DEFAULT '1';
CREATE INDEX IF NOT EXISTS idx_massiva_historico_acc_filial
    ON public.massiva_historico (account, filial_id);

-- 3) STATUS "NO AR" (uma linha por conta+filial) ------------------------------
-- webhook_massiva guarda o status atual da transmissão (colunas usadas hoje:
-- account, status, texto). Com filiais, cada (account, filial_id) tem a SUA linha.
ALTER TABLE public.webhook_massiva
    ADD COLUMN IF NOT EXISTS filial_id TEXT NOT NULL DEFAULT '1';
-- chave única p/ o upsert do status por conta+filial:
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_massiva_acc_filial
    ON public.webhook_massiva (account, filial_id);
-- garante a linha da Filial 2 da conta 21 (a Filial 1 já veio do DEFAULT):
INSERT INTO public.webhook_massiva (account, filial_id, status)
VALUES ('21', '2', false)
ON CONFLICT (account, filial_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- ⚠️ DADOS EXISTENTES: ao adicionar a coluna, TODAS as linhas atuais ficam com
-- filial_id = '1'. Ou seja, o que já existe na conta 21 vira "Filial 1". Se
-- algum registro atual pertence de fato à Filial 2, reatribua à mão, ex.:
--   UPDATE public.massiva_catalogo SET filial_id = '2'
--    WHERE account = '21' AND id IN (...);
--   UPDATE public.massiva_historico SET filial_id = '2'
--    WHERE account = '21' AND id IN (...);
-- ============================================================================


-- ============================================================================
-- QUERIES ATUALIZADAS (todas passam a filtrar/gravar por filial_id)
-- Padrão de robustez: filial ausente/vazia -> '1' via COALESCE(NULLIF($n,''),'1').
-- Assim os apps antigos (que não mandam filial_id) continuam caindo na Filial 1.
-- ============================================================================

-- CATÁLOGO · LER   GET /webhook/massiva-catalogo?account=&token=&filial_id=
--   Query Parameters: {{ [$json.query.account, $json.query.filial_id] }}
SELECT COALESCE(json_agg(json_build_object(
    'id', id, 'tipo', tipo, 'nome', nome, 'texto', texto, 'pai_id', pai_id
) ORDER BY criado_em), '[]') AS dados
FROM public.massiva_catalogo
WHERE account = $1
  AND filial_id = COALESCE(NULLIF($2,''), '1')
  AND deletado_em IS NULL;

-- CATÁLOGO · CRIAR   POST /webhook/massiva-catalogo-criar
--   Query Parameters:
--   {{ [$json.body.account, $json.body.filial_id, $json.body.tipo, $json.body.nome, $json.body.texto, $json.body.pai_id, $json.body.token] }}
INSERT INTO public.massiva_catalogo (account, filial_id, tipo, nome, texto, pai_id, criado_por)
VALUES ($1, COALESCE(NULLIF($2,''), '1'), $3, $4, $5, $6, $7)
RETURNING id, tipo, nome, texto, pai_id;

-- CATÁLOGO · EXCLUIR   POST /webhook/massiva-catalogo-excluir
--   Query Parameters: {{ [$json.body.account, $json.body.id, $json.body.token, $json.body.filial_id] }}
--     $1=account | $2=id | $3=token | $4=filial_id
WITH RECURSIVE sub AS (
    SELECT id FROM public.massiva_catalogo
     WHERE account = $1 AND filial_id = COALESCE(NULLIF($4,''), '1') AND id = $2::bigint
    UNION ALL
    SELECT c.id FROM public.massiva_catalogo c
      JOIN sub ON c.pai_id = sub.id
)
UPDATE public.massiva_catalogo m
   SET deletado_por = $3, deletado_em = now()
 WHERE m.account = $1
   AND m.filial_id = COALESCE(NULLIF($4,''), '1')
   AND m.id IN (SELECT id FROM sub)
   AND m.deletado_em IS NULL
RETURNING m.id;


-- ATIVAR · (a) encerrar anteriores DESTA filial (nó "Encerrar anteriores")
--   Query Parameters: {{ [$('Webhook1').item.json.body.account, $('Webhook1').item.json.body.filial_id] }}
UPDATE public.massiva_historico
   SET desativado_em = now(),
       duracao_segundos = EXTRACT(EPOCH FROM (now() - ativado_em))::int
 WHERE account = $1
   AND filial_id = COALESCE(NULLIF($2,''), '1')
   AND desativado_em IS NULL;

-- ATIVAR · (b) inserir a nova (nó "dados histórico", mapa de colunas)
--   account:        {{ $('Webhook1').item.json.body.account }}
--   filial_id:      {{ $('Webhook1').item.json.body.filial_id }}
--   operador_token: {{ $('Webhook1').item.json.body.token }}
--   mensagem:       {{ $('Webhook1').item.json.body.mensagem }}
--   regiao:         {{ $('Webhook1').item.json.body.regiao }}
--   areas:          {{ JSON.stringify($('Webhook1').item.json.body.areas) }}
--   operador_nome:  {{ $('Execute a SQL query').item.json.operador }}

-- DESATIVAR · fecha TODAS as abertas DESTA filial (nó "Fechar Histórico")
--   Query Parameters: {{ [$('Webhook1').item.json.body.account, $('Webhook1').item.json.body.filial_id] }}
UPDATE public.massiva_historico
   SET desativado_em = now(),
       duracao_segundos = EXTRACT(EPOCH FROM (now() - ativado_em))::int
 WHERE account = $1
   AND filial_id = COALESCE(NULLIF($2,''), '1')
   AND desativado_em IS NULL;

-- HISTÓRICO · LER   GET /webhook/massiva-historico?account=&token=&filial_id=
--   Query Parameters: {{ [$json.query.account, $json.query.filial_id] }}
SELECT COALESCE(json_agg(json_build_object(
    'ativado_em', ativado_em, 'desativado_em', desativado_em,
    'duracao_segundos', duracao_segundos, 'mensagem', mensagem,
    'regiao', regiao, 'operador_nome', operador_nome
) ORDER BY ativado_em DESC), '[]') AS historico
FROM public.massiva_historico
WHERE account = $1
  AND filial_id = COALESCE(NULLIF($2,''), '1');


-- STATUS "NO AR" · LER (página) — nó "Select rows" -> troque por Execute Query
--   Query Parameters: {{ [$json.query.account, $json.query.filial_id] }}
SELECT COALESCE((
    SELECT status FROM public.webhook_massiva
     WHERE account = $1 AND filial_id = COALESCE(NULLIF($2,''), '1')
     LIMIT 1
), false) AS status;

-- STATUS "NO AR" · GRAVAR (ativar/desativar) — nó "Update rows" -> Execute Query (upsert)
--   Query Parameters:
--   {{ [$('Webhook1').item.json.body.account, $('Webhook1').item.json.body.filial_id, $('Webhook1').item.json.body.status, $('Webhook1').item.json.body.texto] }}
INSERT INTO public.webhook_massiva (account, filial_id, status, texto)
VALUES ($1, COALESCE(NULLIF($2,''), '1'), $3, $4)
ON CONFLICT (account, filial_id) DO UPDATE
   SET status = EXCLUDED.status, texto = EXCLUDED.texto;
