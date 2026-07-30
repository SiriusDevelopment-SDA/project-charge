-- ===========================================================================
-- AUDITORIA DO INDICE UNICO DE CLIENTES  --  SOMENTE LEITURA
-- ===========================================================================
--
-- Responde: o indice unico de client (cnpj_cpf, companyId) esta corrompido em
-- producao, e quantas linhas duplicadas ja entraram por causa disso?
--
-- NAO altera dado nenhum. A unica coisa que cria e a extensao `amcheck`, que e
-- uma ferramenta de auditoria do proprio Postgres (nao mexe em tabela). Se o
-- usuario nao for superusuario, esse passo falha, o script segue, e as outras
-- checagens ja bastam para o diagnostico.
--
-- COMO RODAR (dentro da stack de producao):
--   docker exec -i <container-do-postgres> \
--     psql -U <usuario> -d <banco> -f - < auditoria-indice-producao.sql
--
-- Ou, se for banco gerenciado / fora do docker:
--   psql "postgres://usuario:senha@host:5432/banco" -f auditoria-indice-producao.sql
--
-- ATENCAO AO CODIGO DE SAIDA: se o indice estiver corrompido, o passo 1 emite um
-- ERROR e o psql termina com codigo diferente de zero. Isso NAO e falha do
-- script — e o resultado que ele veio buscar. O script segue ate o fim.
--
-- Guarde a saida inteira: e ela que diz o tamanho do problema.
-- ===========================================================================

\echo ''
\echo '=== 0. onde estamos ==='
SELECT current_database()      AS banco,
       inet_server_addr()::text AS host,
       version()               AS versao;

-- ---------------------------------------------------------------------------
-- O passo mais importante do script.
--
-- O Postgres marca o indice como `indisvalid = true` mesmo estando quebrado —
-- ele nao sabe. O bt_index_check compara a estrutura entrada por entrada.
-- `true` no segundo argumento (heapallindexed) verifica se TODA linha da tabela
-- tem entrada correspondente no indice: entrada faltando e exatamente a falha
-- que faz o ON CONFLICT nao achar o cliente e gravar a linha duas vezes.
--
-- SILENCIO = indice sao.
-- ERRO ("item order invariant violated" ou similar) = indice corrompido.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. auditoria estrutural (sem saida = indice sao; erro = corrompido) ==='
CREATE EXTENSION IF NOT EXISTS amcheck;

SELECT bt_index_check('public."IDX_2859c5e162c7390dc297223ba5"'::regclass, true);

\echo ''
\echo '=== 2. mesma auditoria nos outros indices unicos (para medir o alcance) ==='
SELECT bt_index_check('public."IDX_6c5db2f981d109780846ec2a3f"'::regclass, true);
SELECT bt_index_check('public."PK_96da49381769303a6515a8785c7"'::regclass, true);

-- ---------------------------------------------------------------------------
-- A partir daqui e obrigatorio desligar o index scan.
--
-- Com o indice ligado o planner usa justamente a estrutura quebrada e o GROUP BY
-- devolve ZERO duplicatas — o script diria que esta tudo bem. Foi assim que a
-- investigacao se perdeu na primeira vez.
-- ---------------------------------------------------------------------------
SET enable_indexscan     = off;
SET enable_indexonlyscan = off;
SET enable_bitmapscan    = off;

\echo ''
\echo '=== 3. quantas linhas duplicadas existem, por empresa ==='
SELECT co.name                        AS empresa,
       co.account_chatwoot            AS conta,
       COUNT(*)::int                  AS chaves_duplicadas,
       SUM(d.n - 1)::int              AS linhas_excedentes
  FROM (SELECT cnpj_cpf, "companyId", COUNT(*) AS n
          FROM client
         GROUP BY cnpj_cpf, "companyId"
        HAVING COUNT(*) > 1) d
  JOIN company co ON co.id = d."companyId"
 GROUP BY co.name, co.account_chatwoot
 ORDER BY chaves_duplicadas DESC;

\echo ''
\echo '=== 4. quando essas linhas entraram (mostra se ainda esta acontecendo) ==='
WITH dup AS (
  SELECT cnpj_cpf, "companyId" FROM client
   GROUP BY cnpj_cpf, "companyId" HAVING COUNT(*) > 1)
SELECT date_trunc('day', c."createdAt")   AS dia,
       COUNT(*)::int                      AS linhas,
       COUNT(DISTINCT c."companyId")::int AS empresas
  FROM client c
  JOIN dup ON dup.cnpj_cpf = c.cnpj_cpf AND dup."companyId" = c."companyId"
 GROUP BY 1 ORDER BY 1;

\echo ''
\echo '=== 5. alguma pessoa aparece DUAS vezes na tela de vencidos? ==='
\echo '    (linhas_na_tela = 2 seria cobranca duplicada; esperado e 1)'
WITH dup AS (
  SELECT cnpj_cpf, "companyId" FROM client
   GROUP BY cnpj_cpf, "companyId" HAVING COUNT(*) > 1),
linhas AS (
  SELECT c.id, c.cnpj_cpf, c.name, co.name AS empresa,
         (SELECT COUNT(*) FROM invoice i
           WHERE i."clientId" = c.id
             AND LOWER(TRIM(i.status)) = 'a receber')::int AS abertas
    FROM client c
    JOIN dup ON dup.cnpj_cpf = c.cnpj_cpf AND dup."companyId" = c."companyId"
    JOIN company co ON co.id = c."companyId")
SELECT empresa, cnpj_cpf, name,
       string_agg(abertas::text, ' + ')            AS distribuicao_das_abertas,
       COUNT(*) FILTER (WHERE abertas > 0)::int    AS linhas_na_tela
  FROM linhas
 GROUP BY empresa, cnpj_cpf, name
HAVING SUM(abertas) > 0
 ORDER BY linhas_na_tela DESC, empresa;

\echo ''
\echo '=== 6. estado da sincronizacao de cada empresa ==='
\echo '    (empresa em error com faturas recentes = o sintoma deste problema)'
SELECT co.name                        AS empresa,
       s.status,
       s."lastSuccessAt"              AS ultimo_sucesso,
       (SELECT MAX(i."updatedAt") FROM invoice i
         WHERE i."companyId" = co.id) AS ultima_fatura_gravada,
       left(coalesce(s.message, ''), 80) AS mensagem
  FROM invoice_sync_state s
  JOIN company co ON co.id = s."companyId"
 ORDER BY co.name;

\echo ''
\echo '=== fim. o veredito esta no passo 1: se saiu erro ali, o indice esta corrompido ==='
