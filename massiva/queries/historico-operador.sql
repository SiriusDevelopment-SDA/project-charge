-- ============================================================================
-- Histórico da Massiva com o NOME do operador (em vez do token)
-- ----------------------------------------------------------------------------
-- Onde usar: no node "Postgres · Execute Query" do fluxo do webhook
--   /webhook/massiva-historico  (substitui/enriquece o SELECT que hoje retorna
--   o histórico da conta).
--
-- Relação descoberta no código do backend (Coraxy / NestJS):
--   massiva_historico.operador_token  ==  agents."chatwootAccessToken"
--   nome do operador                  ==  agents.name
--   (o token do embed é o chatwootAccessToken do agente — ver auth.service.ts)
--
-- Observações importantes:
--   1) A tabela `agents` tem colunas em camelCase (criadas pelo TypeORM), então
--      no Postgres elas EXIGEM aspas duplas: "chatwootAccessToken", "companyId".
--   2) Alguns registros antigos gravaram o token como a string 'undefined' ou
--      NULL — o NULLIF + LEFT JOIN garantem que essas linhas ainda apareçam,
--      com operador_nome = NULL (a interface mostra "Não identificado").
--   3) PRÉ-REQUISITO: `agents` precisa estar no MESMO banco/conexão deste node.
--      Rode antes, na mesma conexão, para confirmar:
--          SELECT to_regclass('public.agents');   -- não-nulo = existe aqui
--      Se vier NULL, veja a seção "Bancos diferentes" no fim do arquivo.
-- ============================================================================

SELECT
    h.id,
    h.account,
    h.mensagem,
    h.regiao,
    h.ativado_em,
    h.desativado_em,
    -- Se você JÁ tem a coluna h.duracao_segundos, troque este CASE por h.duracao_segundos:
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
WHERE h.account = $1            -- no n8n: {{ $json.query.account }}
ORDER BY h.ativado_em DESC;


-- ----------------------------------------------------------------------------
-- (Opcional) Escopar por empresa, para o token só resolver dentro da conta
-- certa. Como o chatwootAccessToken é único por agente, normalmente não é
-- necessário — use apenas se quiser reforçar:
--
--   LEFT JOIN public.agents a
--          ON a."chatwootAccessToken" = NULLIF(h.operador_token, 'undefined')
--   LEFT JOIN public.companies c
--          ON c.id = a."companyId"
--         AND c.account_chatwoot = h.account
--
-- ----------------------------------------------------------------------------
-- Bancos diferentes (agents NÃO está no mesmo banco de massiva_historico)
-- ----------------------------------------------------------------------------
-- Se o SELECT to_regclass('public.agents') acima retornou NULL, o JOIN direto
-- não funciona. Escolha uma das saídas:
--
--   A) Apontar o node Postgres para o banco que tem AS DUAS tabelas (se o
--      massiva_historico também existir lá), ou sincronizar/replicar `agents`
--      para o banco do n8n.
--
--   B) postgres_fdw: expor a tabela `agents` do outro banco como tabela
--      estrangeira dentro do banco do n8n e então usar o mesmo JOIN acima.
--
--   C) Dois passos no fluxo (sem JOIN): 1º node retorna o histórico; um 2º
--      node consulta os nomes pelos tokens distintos
--         SELECT "chatwootAccessToken" AS token, name
--         FROM public.agents
--         WHERE "chatwootAccessToken" = ANY($1);   -- array de tokens
--      e um Function node casa token -> name antes de responder o webhook.
