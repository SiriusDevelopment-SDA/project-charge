-- ============================================================================
-- Ativação da Massiva — POST /webhook/massiva  → grava TUDO no massiva_historico
-- ----------------------------------------------------------------------------
-- O HTML já manda todos os campos abaixo. Aqui está o setup pra salvar tudo
-- certinho, incluindo a estrutura cidade > bairro > rua (`areas`, em JSONB).
-- Banco compartilhado (n8n_utils): todas as empresas usam a mesma tabela,
-- separadas pela coluna `account`.
--
-- Payload recebido no body:
--   account   TEXT   empresa (ex.: "15")
--   status    BOOL   true = ATIVAR | false = DESATIVAR
--   token     TEXT   operador_token (chatwootAccessToken do agente)
--   mensagem  TEXT   o comunicado
--   regiao    TEXT   resumo legível das áreas (ex.: "São Paulo: Centro | Campinas")
--   areas     JSON   estruturado { todasCidades, todosBairros, todasRuas, cidades:[...] }
--   texto     TEXT   "<mensagem> áreas afetadas: <regiao>" (compat. antiga; redundante)
-- ============================================================================


-- ---------- PASSO 1 — garantir as colunas (rode uma vez) ----------
-- A tabela já existe; isto só adiciona o que faltar (não apaga nada).
CREATE TABLE IF NOT EXISTS public.massiva_historico (
    id               BIGSERIAL PRIMARY KEY,
    account          TEXT NOT NULL,
    operador_token   TEXT,
    mensagem         TEXT,
    regiao           TEXT,
    areas            JSONB,
    ativado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    desativado_em    TIMESTAMPTZ,
    duracao_segundos INTEGER
);
ALTER TABLE public.massiva_historico
    ADD COLUMN IF NOT EXISTS operador_token   TEXT,
    ADD COLUMN IF NOT EXISTS mensagem         TEXT,
    ADD COLUMN IF NOT EXISTS regiao           TEXT,
    ADD COLUMN IF NOT EXISTS areas            JSONB,
    ADD COLUMN IF NOT EXISTS desativado_em    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS duracao_segundos INTEGER;


-- ============================================================================
-- PASSO 2 — no fluxo: [Webhook massiva] -> ... -> [IF status] -> [Postgres] -> [Respond]
--   IF (condição booleana): é TRUE
--      TRUE  -> ramo ATIVAR  (INSERT abaixo)
--      FALSE -> ramo DESATIVAR (UPDATE abaixo)
--   Credencial dos nós Postgres: BANCO IA_N8N (o n8n_utils, banco compartilhado).
--
--   ⚠️ PEGADINHA: se houver nós ENTRE o webhook e o IF (ex.: um Execute Query
--   pra resolver o nome do operador), NÃO use {{ $json.body.status }} no IF —
--   ali o $json já é a saída do nó anterior, sem `body`, e cai sempre no FALSE.
--   Referencie o webhook explicitamente:
--       {{ $('Webhook1').item.json.body.status }}      (operador: is true)
--   (mesmo padrão $('Webhook1').item.json.body.X usado no INSERT abaixo).
-- ============================================================================


-- ---------- ATIVAR (status = true) : cria a linha com TUDO ----------
-- Query Parameters (nesta ordem):
--   {{ [$json.body.account, $json.body.token, $json.body.mensagem, $json.body.regiao, JSON.stringify($json.body.areas)] }}
INSERT INTO public.massiva_historico
    (account, operador_token, mensagem, regiao, areas, ativado_em)
VALUES
    ($1, $2, $3, $4, $5::jsonb, now());


-- ---------- DESATIVAR (status = false) : fecha a última linha aberta ----------
-- Query Parameters: {{ [$json.body.account] }}
UPDATE public.massiva_historico
   SET desativado_em    = now(),
       duracao_segundos = EXTRACT(EPOCH FROM (now() - ativado_em))::int
 WHERE id = (
     SELECT id FROM public.massiva_historico
      WHERE account = $1 AND desativado_em IS NULL
      ORDER BY ativado_em DESC
      LIMIT 1
 );


-- ============================================================================
-- PASSO 3 — LER o histórico : GET /webhook/massiva-historico?account=&token=
-- Mostra o NOME do operador (JOIN com agents) e devolve também o `areas`.
-- Query Parameters: {{ [$json.query.account] }}
-- Variações/diagnóstico do JOIN em queries/historico-operador.sql.
-- ============================================================================
SELECT COALESCE(json_agg(json_build_object(
    'ativado_em',       h.ativado_em,
    'desativado_em',    h.desativado_em,
    'duracao_segundos', h.duracao_segundos,
    'mensagem',         h.mensagem,
    'regiao',           h.regiao,
    'areas',            h.areas,
    'operador_token',   h.operador_token,
    'operador_nome',    COALESCE(a.name, 'Não identificado')
) ORDER BY h.ativado_em DESC), '[]') AS historico
FROM public.massiva_historico h
LEFT JOIN public.agents a ON a."chatwootAccessToken" = h.operador_token
WHERE h.account = $1;
