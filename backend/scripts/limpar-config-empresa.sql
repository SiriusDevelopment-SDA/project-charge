-- ===========================================================================
-- LIMPEZA DO company.config  --  remove o que a aplicacao nao le
-- ===========================================================================
--
-- Contrato completo em docs/contrato-config-empresa.md.
--
-- Remove tres coisas, todas comprovadamente sem nenhuma leitura no backend nem
-- no frontend (varredura por grep):
--
--   `app`                 marcador "maestro", morto
--   `acs`                 { url, username, password } de outro produto, morto —
--                         e com senha em claro
--   `gatewayViabilidade`  zero ocorrencia no repositorio
--   `mapeamentoDeRede`    zero ocorrencia no repositorio
--   `grand_type`          typo de `grant_type`; o HUBSOFT usa o valor fixo
--                         'password' no codigo e nunca le esta chave
--   `username` / `password` EM EMPRESA IXC — o IXC autentica pela coluna
--               `autorization`; esses campos no config sao residuo de cadastro
--               manual e nunca sao lidos. Em SGP/MK/HUBSOFT eles sao
--               OBRIGATORIOS, por isso o filtro por ERP e essencial.
--
-- E normaliza os apelidos do token do Chatwoot: a leitura aceita
-- `chatwoot_admin_token`, `chatwoot_app_token` e `chatwoot_token_admin`; a
-- escrita so produz o primeiro. Aqui os dois antigos viram o canonico.
--
-- COMO RODAR
--   docker exec -i <container-postgres> psql -U <user> -d <banco> -f - < limpar-config-empresa.sql
--
-- O script roda dentro de uma transacao que termina em ROLLBACK. Ele mostra o
-- antes e o depois SEM gravar nada. Para aplicar de verdade, troque a ultima
-- linha de ROLLBACK para COMMIT.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Passo 0 antes de qualquer coisa: o universo real de chaves.
--
-- A lista de chaves mortas acima e o retrato de HOJE. Rodar este inventario
-- primeiro evita o erro de limpar por lista fixa: qualquer chave que apareca
-- aqui e nao esteja em docs/contrato-config-empresa.md precisa ser investigada
-- ANTES de commitar — pode ser lixo novo, ou pode ser algo que passou a ser
-- lido e o documento nao acompanhou.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 0. inventario: toda chave presente em algum config ==='
\echo '    (chave nao listada no contrato = investigar antes de aplicar)'
SELECT chave,
       COUNT(*)::int                AS empresas,
       string_agg(DISTINCT upper(erp), ', ') AS erps
  FROM company, LATERAL jsonb_object_keys(config::jsonb) AS chave
 GROUP BY chave
 ORDER BY empresas DESC, chave;

\echo ''
\echo '=== 1. quais empresas tem chave morta hoje ==='
SELECT name,
       erp,
       (config::jsonb ? 'app')  AS tem_app,
       (config::jsonb ? 'acs')  AS tem_acs,
       (config::jsonb ?| array['gatewayViabilidade','mapeamentoDeRede','grand_type'])
                                AS tem_outras_mortas,
       (upper(erp) = 'IXC' AND (config::jsonb ? 'username'))  AS ixc_com_username,
       (upper(erp) = 'IXC' AND (config::jsonb ? 'password'))   AS ixc_com_password,
       (config::jsonb ? 'chatwoot_app_token')   AS apelido_app_token,
       (config::jsonb ? 'chatwoot_token_admin') AS apelido_token_admin
  FROM company
 WHERE config::jsonb ?| array['app','acs','gatewayViabilidade','mapeamentoDeRede',
                              'grand_type','chatwoot_app_token','chatwoot_token_admin']
    OR (upper(erp) = 'IXC' AND config::jsonb ?| array['username','password'])
 ORDER BY name;

BEGIN;

-- ---------------------------------------------------------------------------
-- Normaliza os apelidos ANTES de qualquer remocao: se um dia `chatwoot_app_token`
-- entrar na lista de chaves a remover, o token seria perdido em vez de migrado.
-- Nao sobrescreve um `chatwoot_admin_token` que ja exista.
-- ---------------------------------------------------------------------------
UPDATE company
   SET config = (config::jsonb
                 || jsonb_build_object('chatwoot_admin_token',
                      COALESCE(config::jsonb ->> 'chatwoot_admin_token',
                               config::jsonb ->> 'chatwoot_app_token',
                               config::jsonb ->> 'chatwoot_token_admin'))
                ) - 'chatwoot_app_token' - 'chatwoot_token_admin'
 WHERE config::jsonb ?| array['chatwoot_app_token','chatwoot_token_admin'];

-- Chaves mortas para qualquer ERP.
UPDATE company
   SET config = config::jsonb
                - 'app' - 'acs' - 'gatewayViabilidade'
                - 'mapeamentoDeRede' - 'grand_type'
 WHERE config::jsonb ?| array['app','acs','gatewayViabilidade',
                              'mapeamentoDeRede','grand_type'];

-- Credencial residual em empresa IXC. O filtro por ERP e o que impede de apagar
-- a credencial REAL de uma empresa SGP/MK/HUBSOFT.
UPDATE company
   SET config = config::jsonb - 'username' - 'password'
 WHERE upper(erp) = 'IXC'
   AND config::jsonb ?| array['username','password'];

\echo ''
\echo '=== 2. como ficaria (dentro da transacao, ainda nao gravado) ==='
SELECT name, erp, jsonb_pretty(config::jsonb) AS config_resultante
  FROM company
 ORDER BY name;

\echo ''
\echo '=== 3. conferencia: nenhuma empresa pode ficar sem credencial obrigatoria ==='
\echo '    (esperado: 0 linhas — qualquer linha aqui e motivo para NAO commitar)'
SELECT name, erp, 'credencial obrigatoria ausente' AS problema
  FROM company
 WHERE (upper(erp) = 'SGP'
        AND NOT (config::jsonb ?& array['username','password']))
    OR (upper(erp) = 'MK'
        AND NOT (config::jsonb ?& array['sys','password','cd_servico','masterToken']))
    OR (upper(erp) = 'HUBSOFT'
        AND NOT (config::jsonb ?& array['client_id','username','password']))
    OR (upper(erp) = 'IXC'
        AND (autorization IS NULL OR btrim(autorization) = ''));

-- Trocar para COMMIT depois de conferir o passo 3.
ROLLBACK;

\echo ''
\echo '=== ROLLBACK executado: nada foi alterado. ==='
\echo '=== Para aplicar, troque a ultima instrucao de ROLLBACK para COMMIT. ==='
