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
    id         BIGSERIAL PRIMARY KEY,
    account    TEXT        NOT NULL,
    tipo       TEXT        NOT NULL CHECK (tipo IN ('modelo','cidade','bairro','rua')),
    nome       TEXT,                       -- cidade/bairro/rua
    texto      TEXT,                       -- modelo
    pai_id     BIGINT REFERENCES public.massiva_catalogo(id) ON DELETE CASCADE,
    criado_por TEXT,                       -- operador_token
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_massiva_catalogo_account_tipo
    ON public.massiva_catalogo (account, tipo);
CREATE INDEX IF NOT EXISTS idx_massiva_catalogo_pai
    ON public.massiva_catalogo (pai_id);
-- O ON DELETE CASCADE faz o banco apagar bairros/ruas sozinho ao apagar a cidade.


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
WHERE account = $1;


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
-- Node: Postgres · Execute Query. Query Parameters: {{ [$json.body.account, $json.body.id] }}
-- O ON DELETE CASCADE remove os bairros/ruas filhos automaticamente.
-- ============================================================================
DELETE FROM public.massiva_catalogo
WHERE account = $1 AND id = $2
RETURNING id;


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
