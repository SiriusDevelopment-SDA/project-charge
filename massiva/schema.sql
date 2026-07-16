-- ============================================================================
-- Modo Massiva — schema de persistência (banco n8n_utils, schema public)
-- ----------------------------------------------------------------------------
-- Acompanha massiva/modo-massiva.html. Em produção a interface grava aqui via
-- webhooks do N8N; no modo teste (arquivo aberto no navegador) usa localStorage.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- massiva_historico — já existe no banco (criada pelo fluxo de ativar/desativar).
-- Documentada aqui só para referência das colunas usadas pela interface:
--   id, account, operador_token, mensagem, regiao, ativado_em, desativado_em
--   (o nome do operador vem de um JOIN — ver queries/historico-operador.sql).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- massiva_catalogo — modelos + cidades + bairros + ruas numa tabela só.
-- Hierarquia por pai_id (bairro -> cidade, rua -> bairro). O ON DELETE CASCADE
-- apaga os filhos automaticamente. SQL completo + queries dos 3 webhooks em
-- queries/catalogo.sql.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.massiva_catalogo (
    id         BIGSERIAL PRIMARY KEY,
    account    TEXT        NOT NULL,
    tipo       TEXT        NOT NULL CHECK (tipo IN ('modelo','cidade','bairro','rua')),
    nome       TEXT,                       -- cidade/bairro/rua
    texto      TEXT,                       -- modelo
    pai_id     BIGINT REFERENCES public.massiva_catalogo(id) ON DELETE CASCADE,
    criado_por TEXT,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_massiva_catalogo_account_tipo
    ON public.massiva_catalogo (account, tipo);
CREATE INDEX IF NOT EXISTS idx_massiva_catalogo_pai
    ON public.massiva_catalogo (pai_id);
