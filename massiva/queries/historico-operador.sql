-- ============================================================================
-- Histórico da Massiva com o NOME do operador (em vez do token)
-- ----------------------------------------------------------------------------
-- Onde usar: no fluxo do webhook /webhook/massiva-historico (o que lista o
-- histórico da conta). NÃO é no fluxo de ativar (/webhook/massiva).
--
-- Relação (descoberta no backend Coraxy):
--   massiva_historico.operador_token  ==  agents."chatwootAccessToken"
--   nome do operador                  ==  agents.name
--   E como esse token é o access token do agente NO CHATWOOT, também dá para
--   resolver o nome direto no banco do Chatwoot (access_tokens + users).
-- ============================================================================

-- ############################################################################
-- ERRO COMUM: relation "public.massiva_historico" does not exist
-- ----------------------------------------------------------------------------
-- Significa que o node Postgres está apontando para o BANCO ERRADO (ex.: a
-- credencial "chatwoot"). A massiva_historico fica no banco onde a massiva
-- grava os registros (o n8n_utils). Solução:
--   -> troque a Credential deste node para a MESMA que o node de gravação da
--      massiva usa (a que escreve em massiva_historico), e rode de novo.
--
-- Depois, confirme onde cada tabela está (rode na credencial do n8n_utils):
--   SELECT to_regclass('public.massiva_historico') AS tem_historico,
--          to_regclass('public.agents')            AS tem_agents;
--   - as duas não-nulas  -> use a OPÇÃO 1 (JOIN direto).
--   - tem_agents = NULL  -> agents está em outro banco: use a OPÇÃO 2 (2 passos).
-- ############################################################################


-- ============================================================================
-- OPÇÃO 1 — massiva_historico e agents no MESMO banco (JOIN direto)
-- ============================================================================
-- Colunas camelCase da `agents` exigem aspas duplas: "chatwootAccessToken".
SELECT
    h.id,
    h.account,
    h.mensagem,
    h.regiao,
    h.ativado_em,
    h.desativado_em,
    -- Se você JÁ tem a coluna h.duracao_segundos, troque este CASE por ela:
    CASE
        WHEN h.desativado_em IS NOT NULL
            THEN EXTRACT(EPOCH FROM (h.desativado_em - h.ativado_em))::int
        ELSE NULL
    END AS duracao_segundos,
    a.name AS operador_nome,
    NULLIF(h.operador_token, 'undefined') AS operador_token
FROM public.massiva_historico h
LEFT JOIN public.agents a
       ON a."chatwootAccessToken" = NULLIF(h.operador_token, 'undefined')
WHERE h.account = $1            -- ligue $1 em Options > Query Parameters ao account
ORDER BY h.ativado_em DESC;
-- No n8n, o account vem da query string: {{ $json.query.account }}.
-- Prefira "Query Parameters" (evita SQL injection) a interpolar direto no SQL.


-- ============================================================================
-- OPÇÃO 2 — bancos diferentes: 2 nodes + Code (resolve o nome pelo Chatwoot)
-- ============================================================================
-- NODE 1 (credencial n8n_utils) — histórico cru:
--   SELECT id, account, mensagem, regiao, ativado_em, desativado_em, operador_token
--   FROM public.massiva_historico
--   WHERE account = $1
--   ORDER BY ativado_em DESC;
--
-- NODE 2 (credencial chatwoot) — nomes pelos tokens distintos:
--   SELECT at.token AS operador_token, u.name AS operador_nome
--   FROM access_tokens at
--   JOIN users u ON u.id = at.owner_id
--   WHERE at.owner_type = 'User'
--     AND at.token = ANY($1::text[]);   -- $1 = array de tokens do NODE 1
--
-- NODE 3 (Code) — casa token -> nome e monta a resposta do webhook:
--   const historico = $('Node 1').all().map(i => i.json);
--   const nomes = {};
--   for (const r of $('Node 2').all()) nomes[r.json.operador_token] = r.json.operador_nome;
--   return historico.map(h => ({ json: {
--     ...h,
--     duracao_segundos: h.desativado_em
--       ? Math.round((new Date(h.desativado_em) - new Date(h.ativado_em)) / 1000)
--       : null,
--     operador_nome: nomes[h.operador_token] || null,
--   }}));
--
-- (Alternativa à OPÇÃO 2: postgres_fdw para expor `agents`/`users` do outro
--  banco dentro do banco do n8n e então usar o JOIN da OPÇÃO 1.)
