-- ============================================================================
-- Ativação da Massiva — POST /webhook/massiva  (grava no public.massiva_historico)
-- ----------------------------------------------------------------------------
-- Este webhook JÁ EXISTE (fluxo antigo). Depois da Fase 2 o payload ganhou o
-- objeto `areas` (cidade > bairro > rua estruturado). O ponto de atenção é:
-- NÃO tente gravar o objeto `areas` numa coluna de texto — ou o INSERT quebra.
-- Para o histórico, os campos planos já bastam (`regiao` é o resumo legível).
--
-- Rodar no mesmo banco compartilhado (n8n_utils) — todas as empresas usam a
-- mesma massiva_historico, separadas pela coluna `account`.
-- ============================================================================

-- ---------- Payload recebido no body ----------
--   texto     TEXT     "<mensagem> áreas afetadas: <regiao>"  (compat. antiga)
--   account   TEXT     empresa (ex.: "15")
--   status    BOOL     true = ATIVAR | false = DESATIVAR
--   token     TEXT     operador_token (chatwootAccessToken do agente)
--   mensagem  TEXT     só o comunicado
--   regiao    TEXT     resumo legível das áreas (ex.: "São Paulo: Centro | Campinas")
--   areas     JSON     estruturado — { todasCidades, todosBairros, todasRuas, cidades:[...] }
--                      (para a IA casar o cliente; NÃO precisa ir pro histórico)

-- ============================================================================
-- No fluxo: [Webhook massiva] -> [IF status] -> [Postgres] -> [Respond]
--   IF (condição): {{ $json.body.status }} === true  -> ramo ATIVAR (INSERT)
--                                            senão    -> ramo DESATIVAR (UPDATE)
-- ============================================================================


-- ---------- ATIVAR (status = true) : cria a linha ----------
-- Query Parameters: {{ [$json.body.account, $json.body.token, $json.body.mensagem, $json.body.regiao] }}
INSERT INTO public.massiva_historico (account, operador_token, mensagem, regiao, ativado_em)
VALUES ($1, $2, $3, $4, now());
-- (ajuste os nomes das colunas para os que já existem na sua massiva_historico)


-- ---------- DESATIVAR (status = false) : fecha a última linha aberta ----------
-- Query Parameters: {{ [$json.body.account] }}
UPDATE public.massiva_historico
   SET desativado_em     = now(),
       duracao_segundos  = EXTRACT(EPOCH FROM (now() - ativado_em))::int
 WHERE id = (
     SELECT id FROM public.massiva_historico
      WHERE account = $1 AND desativado_em IS NULL
      ORDER BY ativado_em DESC
      LIMIT 1
 );


-- ============================================================================
-- OPCIONAL — guardar TAMBÉM o `areas` estruturado (pra IA ler do banco depois).
-- Só se você quiser; o histórico da tela não precisa disto.
-- ============================================================================
ALTER TABLE public.massiva_historico ADD COLUMN IF NOT EXISTS areas JSONB;

-- No INSERT de ATIVAR, inclua a coluna areas (5º parâmetro):
-- Query Parameters:
--   {{ [$json.body.account, $json.body.token, $json.body.mensagem, $json.body.regiao, JSON.stringify($json.body.areas)] }}
--
-- INSERT INTO public.massiva_historico (account, operador_token, mensagem, regiao, areas, ativado_em)
-- VALUES ($1, $2, $3, $4, $5::jsonb, now());


-- ============================================================================
-- LER o histórico — GET /webhook/massiva-historico?account=&token=
-- Mostra o NOME do operador (JOIN com agents). Detalhe e variações em
-- queries/historico-operador.sql. Query Parameters: {{ [$json.query.account] }}
-- ============================================================================
SELECT COALESCE(json_agg(json_build_object(
    'ativado_em',       h.ativado_em,
    'desativado_em',    h.desativado_em,
    'duracao_segundos', h.duracao_segundos,
    'mensagem',         h.mensagem,
    'regiao',           h.regiao,
    'operador_token',   h.operador_token,
    'operador_nome',    COALESCE(a.name, 'Não identificado')
) ORDER BY h.ativado_em DESC), '[]') AS historico
FROM public.massiva_historico h
LEFT JOIN public.agents a ON a."chatwootAccessToken" = h.operador_token
WHERE h.account = $1;
