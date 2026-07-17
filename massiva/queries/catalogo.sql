-- ============================================================================
-- Catálogo da Massiva no banco (modelos + cidades + bairros + ruas)
-- ----------------------------------------------------------------------------
-- UMA tabela guarda tudo (coluna `tipo`), com hierarquia via `pai_id`:
--   modelo -> pai_id NULL           (usa a coluna `texto`)
--   cidade -> pai_id NULL           (usa a coluna `nome`)
--   bairro -> pai_id = id da cidade (usa `nome`)
--   rua    -> pai_id = id do bairro (usa `nome`)
--
-- O HTML fala com 3 webhooks (ler / criar / excluir). Em produção grava aqui;
-- no modo teste (arquivo aberto no navegador) usa localStorage.
-- Rodar tudo no banco n8n_utils (mesmo da massiva_historico).
-- ============================================================================

-- ---------- 1) Criar a tabela (rode uma vez) ----------
CREATE TABLE IF NOT EXISTS public.massiva_catalogo (
    id           BIGSERIAL PRIMARY KEY,
    account      TEXT        NOT NULL,
    tipo         TEXT        NOT NULL CHECK (tipo IN ('modelo','cidade','bairro','rua')),
    nome         TEXT,                       -- cidade/bairro/rua
    texto        TEXT,                       -- modelo
    pai_id       BIGINT REFERENCES public.massiva_catalogo(id) ON DELETE CASCADE,
    criado_por   TEXT,                       -- operador_token de quem CRIOU
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deletado_por TEXT,                       -- operador_token de quem EXCLUIU
    deletado_em  TIMESTAMPTZ                 -- quando foi excluído (NULL = ativo)
);
CREATE INDEX IF NOT EXISTS idx_massiva_catalogo_account_tipo
    ON public.massiva_catalogo (account, tipo);
CREATE INDEX IF NOT EXISTS idx_massiva_catalogo_pai
    ON public.massiva_catalogo (pai_id);

-- ---------- 1b) Migração p/ tabela que JÁ existe (rode uma vez) ----------
-- Se a tabela foi criada antes, adiciona as colunas de exclusão lógica.
ALTER TABLE public.massiva_catalogo
    ADD COLUMN IF NOT EXISTS deletado_por TEXT,
    ADD COLUMN IF NOT EXISTS deletado_em  TIMESTAMPTZ;

-- EXCLUSÃO LÓGICA (soft delete): em vez de apagar a linha, marcamos
-- deletado_por/deletado_em. Assim fica registrado NO BANCO quem excluiu
-- (espelhando o criado_por) — um DELETE de verdade apagaria a linha e não
-- sobraria onde gravar o autor. A cascata (apagar bairros/ruas junto) é feita
-- na própria query de excluir, com um CTE recursivo (ver WEBHOOK 3).


-- ============================================================================
-- WEBHOOK 1 — LER TUDO   (GET /webhook/massiva-catalogo?account=&token=)
-- Node: Postgres · Execute Query. Query Parameters: {{ [$json.query.account] }}
-- Retorna 1 linha { dados: [...] } (sempre, mesmo vazio).
-- ============================================================================
SELECT COALESCE(
    json_agg(json_build_object(
        'id', id, 'tipo', tipo, 'nome', nome, 'texto', texto, 'pai_id', pai_id
    ) ORDER BY criado_em),
    '[]'
) AS dados
FROM public.massiva_catalogo
WHERE account = $1
  AND deletado_em IS NULL;   -- só os ativos (esconde os excluídos logicamente)


-- ============================================================================
-- WEBHOOK 2 — CRIAR   (POST /webhook/massiva-catalogo-criar)
-- Body recebido: { account, token, tipo, nome, texto, pai_id }
-- Node: Postgres · Execute Query. Query Parameters (nesta ordem):
--   {{ [$json.body.account, $json.body.tipo, $json.body.nome, $json.body.texto, $json.body.pai_id, $json.body.token] }}
-- IMPORTANTE: o RETURNING é obrigatório (o HTML precisa do id gerado).
-- ============================================================================
INSERT INTO public.massiva_catalogo (account, tipo, nome, texto, pai_id, criado_por)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, tipo, nome, texto, pai_id;


-- ============================================================================
-- WEBHOOK 3 — EXCLUIR   (POST /webhook/massiva-catalogo-excluir)
-- Body recebido: { account, token, id }
-- Node: Postgres · Execute Query. Query Parameters (nesta ordem):
--   {{ [$json.body.account, $json.body.id, $json.body.token] }}
--     $1 = account | $2 = id do item | $3 = token do operador (quem excluiu)
--
-- Exclusão LÓGICA com cascata:
--   - O CTE recursivo `sub` junta o próprio item + TODOS os descendentes
--     (cidade -> seus bairros -> suas ruas; bairro -> suas ruas).
--   - O UPDATE marca todos eles como excluídos (deletado_por = quem, deletado_em = now).
--   - Como a leitura filtra `deletado_em IS NULL`, eles somem da tela na hora,
--     mas continuam registrados no banco (com o autor da exclusão).
-- ============================================================================
WITH RECURSIVE sub AS (
    SELECT id
      FROM public.massiva_catalogo
     WHERE account = $1 AND id = $2::bigint
    UNION ALL
    SELECT c.id
      FROM public.massiva_catalogo c
      JOIN sub ON c.pai_id = sub.id
)
UPDATE public.massiva_catalogo m
   SET deletado_por = $3,
       deletado_em  = now()
 WHERE m.account = $1
   AND m.id IN (SELECT id FROM sub)
   AND m.deletado_em IS NULL
RETURNING m.id;


-- ============================================================================
-- Montagem no N8N (cada webhook = 3 nodes):
--   [Webhook] -> [Postgres · Execute Query] -> [Respond to Webhook]
--   - Webhook 1: método GET,  path massiva-catalogo
--   - Webhook 2: método POST, path massiva-catalogo-criar
--   - Webhook 3: método POST, path massiva-catalogo-excluir
--   - Credencial dos 3 nodes Postgres: BANCO IA_N8N (a do n8n_utils).
--   - Ligue "Always Output Data" nos nodes Postgres (não trava se vier vazio).
-- Mesma origem do fluxo da massiva -> sem CORS.
-- ============================================================================
