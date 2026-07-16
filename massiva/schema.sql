-- ============================================================================
-- Modo Massiva — schema de persistência (base n8n_utils, schema public)
-- ----------------------------------------------------------------------------
-- Este arquivo acompanha massiva/modo-massiva.html. A interface hoje roda em
-- modo mock (localStorage); quando o backend N8N estiver pronto, estas tabelas
-- passam a ser a fonte da verdade e o Store do HTML aponta para os webhooks.
--
-- Convenção: tudo é escopo por empresa via coluna `account` (mesmo valor de
-- query.account que o N8N já injeta na página).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FASE 1 — Mensagens padrão (modelos) por empresa
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.massiva_modelos (
    id          BIGSERIAL PRIMARY KEY,
    account     TEXT        NOT NULL,
    texto       TEXT        NOT NULL,
    criado_por  TEXT,                          -- operador_token que criou
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_massiva_modelos_account
    ON public.massiva_modelos (account);

-- Evita modelos duplicados exatamente iguais dentro da mesma conta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_massiva_modelos_account_texto
    ON public.massiva_modelos (account, md5(texto));


-- ----------------------------------------------------------------------------
-- FASE 2 — Catálogo de localização (cidade > bairro > rua), por empresa
-- Exclusão em cascata: apagar a cidade apaga seus bairros e ruas.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.massiva_cidades (
    id         BIGSERIAL PRIMARY KEY,
    account    TEXT        NOT NULL,
    nome       TEXT        NOT NULL,
    criado_por TEXT,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_massiva_cidades_account
    ON public.massiva_cidades (account);
CREATE UNIQUE INDEX IF NOT EXISTS uq_massiva_cidades_account_nome
    ON public.massiva_cidades (account, lower(nome));

CREATE TABLE IF NOT EXISTS public.massiva_bairros (
    id         BIGSERIAL PRIMARY KEY,
    account    TEXT        NOT NULL,
    cidade_id  BIGINT      NOT NULL REFERENCES public.massiva_cidades(id) ON DELETE CASCADE,
    nome       TEXT        NOT NULL,
    criado_por TEXT,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_massiva_bairros_cidade
    ON public.massiva_bairros (cidade_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_massiva_bairros_cidade_nome
    ON public.massiva_bairros (cidade_id, lower(nome));

CREATE TABLE IF NOT EXISTS public.massiva_ruas (
    id         BIGSERIAL PRIMARY KEY,
    account    TEXT        NOT NULL,
    bairro_id  BIGINT      NOT NULL REFERENCES public.massiva_bairros(id) ON DELETE CASCADE,
    nome       TEXT        NOT NULL,
    criado_por TEXT,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_massiva_ruas_bairro
    ON public.massiva_ruas (bairro_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_massiva_ruas_bairro_nome
    ON public.massiva_ruas (bairro_id, lower(nome));
