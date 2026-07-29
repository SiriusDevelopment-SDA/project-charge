/**
 * Deduplica `client (cnpj_cpf, companyId)` e reconstrói o índice único
 * IDX_2859c5e162c7390dc297223ba5.
 *
 * ---------------------------------------------------------------------------
 * O PROBLEMA
 * ---------------------------------------------------------------------------
 * O índice único está CORROMPIDO: existem linhas duplicadas fisicamente na
 * tabela que o índice não enxerga. A prova é a mesma consulta dar resultados
 * diferentes com e sem índice:
 *
 *   SELECT ... WHERE cnpj_cpf = '08514587340' AND "companyId" = '40a83719-...'
 *     com índice → 1 linha
 *     seq scan   → 2 linhas
 *
 * O sintoma que chega ao usuário é o `markClientsAsChecked` (um simples UPDATE
 * de invoiceSnapshotCheckedAt) falhando com "duplicate key value violates unique
 * constraint": ao atualizar a linha o Postgres grava uma nova entrada de índice,
 * a checagem de unicidade finalmente encontra a linha irmã e acusa. Isso derruba
 * a sincronização inteira da empresa.
 *
 * Um índice único VÁLIDO nunca permite duplicata. Logo as duplicatas entraram
 * com o índice já quebrado — não foram criadas por concorrência da aplicação. A
 * causa mais provável é mudança de collation do sistema (o `cnpj_cpf` é text sob
 * en_US.utf8), o que reordena o btree e faz a checagem de unicidade procurar no
 * lugar errado. Por isso não basta apagar as duplicatas: sem REINDEX o índice
 * continua mentindo e novas duplicatas voltam a entrar.
 *
 * ---------------------------------------------------------------------------
 * COMO RODAR
 * ---------------------------------------------------------------------------
 *   # 1. diagnóstico, não altera nada (padrão)
 *   npx ts-node --transpile-only scripts/dedupe-clients-reindex.ts
 *
 *   # 2. aplica a correção
 *   npx ts-node --transpile-only scripts/dedupe-clients-reindex.ts --aplicar
 *
 * Lê as mesmas variáveis de ambiente da API: DB_HOST, DB_PORT, DB_USER_NAME,
 * DB_PASSWORD, DB_DATABASE.
 *
 * RECOMENDAÇÃO: rodar com a API parada. Enquanto o índice estiver corrompido,
 * qualquer sync de clientes pode inserir duplicata nova — inclusive entre o
 * dedupe e o REINDEX. O script re-verifica no fim e avisa se isso aconteceu.
 */
import { Client } from 'pg';

const INDICE = 'IDX_2859c5e162c7390dc297223ba5';
const APLICAR = process.argv.includes('--aplicar');

/**
 * Todas as tabelas que referenciam client(id). Levantado de pg_constraint — se
 * uma FK nova aparecer e não estiver aqui, o DELETE do final falha em vez de
 * deixar órfão, que é o comportamento desejado.
 */
const FILHOS: Array<{ tabela: string; coluna: string }> = [
  { tabela: 'invoice', coluna: '"clientId"' },
  { tabela: 'service', coluna: '"clientId"' },
  { tabela: 'payment_promise', coluna: 'client_id' },
  { tabela: 'client_interaction', coluna: 'client_id' },
  { tabela: 'campaign_clients', coluna: '"clientId"' },
];

type LinhaCliente = {
  id: string;
  cnpj_cpf: string;
  companyId: string;
  empresa: string;
  clientId: string | null;
  createdAt: Date;
  updatedAt: Date | null;
};

type Grupo = {
  cnpj_cpf: string;
  companyId: string;
  empresa: string;
  vencedora: LinhaCliente;
  perdedoras: LinhaCliente[];
};

function conectar(): Client {
  return new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER_NAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
}

/**
 * Sem isto o script não enxerga o problema que veio corrigir: o planner usa o
 * índice corrompido e o GROUP BY devolve zero duplicatas. Foi exatamente assim
 * que a investigação se perdeu da primeira vez.
 */
async function forcarSeqScan(db: Client) {
  await db.query('SET enable_indexscan = off');
  await db.query('SET enable_indexonlyscan = off');
  await db.query('SET enable_bitmapscan = off');
}

async function carregarDuplicatas(db: Client): Promise<Grupo[]> {
  const { rows } = await db.query<LinhaCliente>(`
    WITH dup AS (
      SELECT cnpj_cpf, "companyId"
        FROM client
       GROUP BY cnpj_cpf, "companyId"
      HAVING COUNT(*) > 1
    )
    SELECT c.id, c.cnpj_cpf, c."companyId", c."clientId",
           c."createdAt", c."updatedAt", co.name AS empresa
      FROM client c
      JOIN dup ON dup.cnpj_cpf = c.cnpj_cpf AND dup."companyId" = c."companyId"
      JOIN company co ON co.id = c."companyId"
     ORDER BY co.name, c.cnpj_cpf, c."createdAt"
  `);

  const porChave = new Map<string, LinhaCliente[]>();
  for (const linha of rows) {
    const chave = `${linha.companyId}|${linha.cnpj_cpf}`;
    const lista = porChave.get(chave) ?? [];
    lista.push(linha);
    porChave.set(chave, lista);
  }

  const grupos: Grupo[] = [];
  for (const linhas of porChave.values()) {
    // Vencedora = a mais recente. Todas as duplicatas observadas têm o MESMO
    // clientId do ERP, ou seja, são a mesma pessoa gravada duas vezes — então a
    // escolha não perde informação de negócio: os filhos são todos repontados
    // logo abaixo, e o que sobra de diferente entre as linhas são os atributos
    // cadastrais (nome, telefone), onde a leitura mais nova do ERP é a correta.
    const ordenadas = [...linhas].sort((a, b) => {
      const porCriacao = b.createdAt.getTime() - a.createdAt.getTime();
      if (porCriacao !== 0) return porCriacao;
      const ua = a.updatedAt?.getTime() ?? 0;
      const ub = b.updatedAt?.getTime() ?? 0;
      if (ub !== ua) return ub - ua;
      return a.id.localeCompare(b.id); // desempate estável
    });

    grupos.push({
      cnpj_cpf: ordenadas[0].cnpj_cpf,
      companyId: ordenadas[0].companyId,
      empresa: ordenadas[0].empresa,
      vencedora: ordenadas[0],
      perdedoras: ordenadas.slice(1),
    });
  }

  return grupos;
}

async function contarFilhos(
  db: Client,
  ids: string[],
): Promise<Record<string, number>> {
  const contagem: Record<string, number> = {};
  for (const { tabela, coluna } of FILHOS) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM ${tabela} WHERE ${coluna} = ANY($1::uuid[])`,
      [ids],
    );
    contagem[tabela] = rows[0].n;
  }
  return contagem;
}

async function repontarEApagar(db: Client, grupos: Grupo[]) {
  for (const grupo of grupos) {
    const perdedoras = grupo.perdedoras.map((l) => l.id);

    for (const { tabela, coluna } of FILHOS) {
      // campaign_clients é (campaignId, clientId) e a chave primária é o próprio
      // par: repontar às cegas violaria a PK quando as duas linhas duplicadas
      // estão na mesma campanha. Nesse caso a linha da perdedora é redundante —
      // a associação já existe pela vencedora — então some.
      if (tabela === 'campaign_clients') {
        await db.query(
          `DELETE FROM campaign_clients cc
            WHERE cc."clientId" = ANY($1::uuid[])
              AND EXISTS (
                SELECT 1 FROM campaign_clients v
                 WHERE v."campaignId" = cc."campaignId"
                   AND v."clientId" = $2::uuid)`,
          [perdedoras, grupo.vencedora.id],
        );
      }

      await db.query(
        `UPDATE ${tabela} SET ${coluna} = $2::uuid WHERE ${coluna} = ANY($1::uuid[])`,
        [perdedoras, grupo.vencedora.id],
      );
    }

    await db.query(`DELETE FROM client WHERE id = ANY($1::uuid[])`, [
      perdedoras,
    ]);
  }
}

/**
 * O REINDEX é a parte que realmente corrige. Apagar as duplicatas sem
 * reconstruir o índice só limpa o sintoma: a estrutura continua desordenada e a
 * próxima carga de clientes insere duplicata de novo.
 *
 * CONCURRENTLY não bloqueia leitura/escrita, mas NÃO pode rodar dentro de
 * transação — por isso fora do BEGIN/COMMIT acima.
 */
async function reindexar(db: Client) {
  await db.query(`REINDEX INDEX CONCURRENTLY public."${INDICE}"`);
}

/**
 * Prova FUNCIONAL de que o índice voltou a valer.
 *
 * Comparar contagens com e sem índice não serve aqui: um GROUP BY da tabela
 * inteira o planner resolve por seq scan de qualquer jeito, então os dois lados
 * dariam o mesmo número mesmo com o índice quebrado — a verificação passaria
 * sem verificar nada.
 *
 * O que prova de verdade é tentar inserir uma duplicata e exigir que o banco
 * recuse. Roda dentro de transação e sempre desfaz; nada é gravado.
 */
/**
 * Auditoria estrutural do índice pelo próprio Postgres (extensão amcheck).
 *
 * `heapallindexed => true` verifica se TODA linha da tabela tem entrada
 * correspondente no índice — entrada faltando é exatamente a falha que deixa o
 * ON CONFLICT não achar o cliente existente e inserir duplicata.
 *
 * Isto é o que tira o diagnóstico do campo da inferência: `indisvalid` diz que
 * o índice está bom, e ele está mentindo. O amcheck responde de verdade.
 * Só leitura — AccessShareLock, não bloqueia a aplicação.
 */
async function auditarIntegridade(
  db: Client,
): Promise<{ suportado: boolean; integro: boolean; detalhe: string }> {
  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS amcheck');
  } catch (erro: any) {
    return {
      suportado: false,
      integro: false,
      detalhe: `amcheck indisponível (${erro?.message}) — requer superusuário`,
    };
  }

  try {
    await db.query(`SELECT bt_index_check($1::regclass, true)`, [
      `public."${INDICE}"`,
    ]);
    return { suportado: true, integro: true, detalhe: 'estrutura íntegra' };
  } catch (erro: any) {
    return { suportado: true, integro: false, detalhe: erro?.message };
  }
}

async function verificarUpdateEmMassa(
  db: Client,
  companyIds: string[],
): Promise<{ ok: boolean; detalhe: string }> {
  // Duas verificações mais óbvias foram descartadas por não provarem nada:
  //
  //  - comparar contagem de duplicatas com e sem índice: um GROUP BY da tabela
  //    inteira o planner resolve por seq scan dos dois lados, então os números
  //    batem mesmo com o índice quebrado;
  //  - tentar INSERT de uma duplicata: o índice RECUSA, mesmo corrompido — ele
  //    tem a entrada da chave, só não tem a da segunda linha. Testado: recusou
  //    normalmente com o banco comprovadamente sujo.
  //
  // O que falha de verdade — e é exatamente o sintoma em produção — é o UPDATE
  // em massa do markClientsAsChecked: ao atualizar a linha o Postgres grava uma
  // nova entrada de índice, que só então colide com a entrada da linha irmã.
  // Então o teste é reproduzir esse UPDATE. Transação sempre desfeita.
  await db.query('BEGIN');
  try {
    await db.query(
      `UPDATE client SET "invoiceSnapshotCheckedAt" = now()
        WHERE "companyId" = ANY($1::uuid[])`,
      [companyIds],
    );
    await db.query('ROLLBACK');
    return {
      ok: true,
      detalhe: 'UPDATE em massa passou sem violar unicidade',
    };
  } catch (erro: any) {
    await db.query('ROLLBACK');
    return {
      ok: false,
      detalhe:
        erro?.code === '23505'
          ? `UPDATE em massa falhou com duplicate key (${erro?.detail ?? erro?.constraint})`
          : `erro inesperado no teste: ${erro?.message}`,
    };
  }
}

/**
 * Se a causa for collation, este índice dificilmente é o único afetado. Não
 * corrige nada — só aponta onde mais olhar.
 */
async function auditarOutrosIndicesUnicos(db: Client) {
  const { rows } = await db.query(`
    SELECT i.indexrelid::regclass::text AS indice, t.relname AS tabela
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE i.indisunique AND n.nspname = 'public'
       AND EXISTS (
         SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = i.indrelid
            AND a.attnum = ANY(i.indkey::int2[])
            AND a.atttypid IN ('text'::regtype, 'varchar'::regtype))
     ORDER BY t.relname`);

  console.log('');
  console.log('Índices únicos que envolvem coluna textual (mesma exposição):');
  for (const r of rows) {
    console.log(`  ${r.tabela} → ${r.indice}`);
  }
  console.log(
    '  (auditar cada um comparando índice x seq scan, se a causa for collation)',
  );
}

async function main() {
  const db = conectar();
  await db.connect();

  const info = await db.query(
    `SELECT current_database() AS db, inet_server_addr()::text AS host`,
  );
  console.log('='.repeat(70));
  console.log(`Banco   : ${info.rows[0].db} @ ${info.rows[0].host ?? 'local'}`);
  console.log(`Modo    : ${APLICAR ? 'APLICAR (vai alterar dados)' : 'DIAGNÓSTICO (não altera nada)'}`);
  console.log('='.repeat(70));

  await forcarSeqScan(db);

  const grupos = await carregarDuplicatas(db);

  if (!grupos.length) {
    console.log('');
    console.log('Nenhuma chave duplicada encontrada.');
    const todas = await db.query<{ id: string }>(`SELECT id FROM company`);
    const teste = await verificarUpdateEmMassa(
      db,
      todas.rows.map((c) => c.id),
    );
    console.log(
      `UPDATE em massa (o que quebrava a sync): ${teste.ok ? 'OK' : 'FALHOU'} — ${teste.detalhe}`,
    );
    if (!teste.ok) {
      console.log(
        'Sem duplicata para limpar, mas o UPDATE ainda falha: rodar apenas o REINDEX.',
      );
      process.exitCode = 1;
    }
    await auditarOutrosIndicesUnicos(db);
    await db.end();
    return;
  }

  console.log('');
  console.log(`${grupos.length} chave(s) duplicada(s):`);
  console.log('');

  let totalPerdedoras = 0;
  for (const grupo of grupos) {
    const idsPerdedoras = grupo.perdedoras.map((l) => l.id);
    const filhos = await contarFilhos(db, idsPerdedoras);
    const movidos = Object.entries(filhos)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${t}=${n}`)
      .join(', ');

    totalPerdedoras += idsPerdedoras.length;

    console.log(`  ${grupo.empresa} | cpf/cnpj ${grupo.cnpj_cpf}`);
    console.log(
      `    mantém  ${grupo.vencedora.id} (criada ${grupo.vencedora.createdAt.toISOString()}, erpId ${grupo.vencedora.clientId})`,
    );
    for (const perdedora of grupo.perdedoras) {
      console.log(
        `    remove  ${perdedora.id} (criada ${perdedora.createdAt.toISOString()}, erpId ${perdedora.clientId})`,
      );
    }
    console.log(`    repontar: ${movidos || 'nada referenciando'}`);
  }

  console.log('');
  console.log(
    `Total: ${totalPerdedoras} linha(s) de client serão removidas após repontar os filhos.`,
  );

  const empresasAfetadas = [...new Set(grupos.map((g) => g.companyId))];

  if (!APLICAR) {
    // Roda também no diagnóstico: aqui o esperado é FALHAR, o que confirma a
    // corrupção antes de qualquer alteração. Transação desfeita, não grava.
    const antes = await verificarUpdateEmMassa(db, empresasAfetadas);
    console.log('');
    console.log(
      `UPDATE em massa hoje (o que quebra a sync): ${antes.ok ? 'OK' : 'FALHOU'} — ${antes.detalhe}`,
    );

    const auditoria = await auditarIntegridade(db);
    console.log(
      `Auditoria do índice (amcheck): ${!auditoria.suportado ? 'NÃO EXECUTADA' : auditoria.integro ? 'ÍNTEGRO' : 'CORROMPIDO'} — ${auditoria.detalhe}`,
    );

    console.log('');
    console.log('Nada foi alterado. Para aplicar:');
    console.log(
      '  npx ts-node --transpile-only scripts/dedupe-clients-reindex.ts --aplicar',
    );
    await auditarOutrosIndicesUnicos(db);
    await db.end();
    return;
  }

  console.log('');
  console.log('--- aplicando dedupe (transação única) ---');
  await db.query('BEGIN');
  try {
    await repontarEApagar(db, grupos);
    await db.query('COMMIT');
    console.log('dedupe commitado.');
  } catch (erro: any) {
    await db.query('ROLLBACK');
    console.error(`ROLLBACK — nada foi alterado. Motivo: ${erro?.message}`);
    await db.end();
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log(`--- REINDEX INDEX CONCURRENTLY "${INDICE}" ---`);
  try {
    await reindexar(db);
    console.log('índice reconstruído.');
  } catch (erro: any) {
    console.error(`REINDEX falhou: ${erro?.message}`);
    console.error(
      'Um REINDEX CONCURRENTLY que falha deixa um índice inválido com sufixo _ccnew.',
    );
    console.error(
      'Conferir com: SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;',
    );
    await db.end();
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('--- verificação final ---');
  const restantes = await carregarDuplicatas(db);
  console.log(`Duplicatas restantes (seq scan): ${restantes.length}`);
  if (restantes.length) {
    console.log(
      'ATENÇÃO: entraram duplicatas novas durante a execução — provavelmente um sync rodou em paralelo.',
    );
    console.log('Rodar o script de novo, com a API parada.');
  }

  const auditoria = await auditarIntegridade(db);
  console.log(
    `Auditoria do índice (amcheck): ${!auditoria.suportado ? 'NÃO EXECUTADA' : auditoria.integro ? 'ÍNTEGRO' : 'AINDA CORROMPIDO'} — ${auditoria.detalhe}`,
  );
  if (auditoria.suportado && !auditoria.integro) {
    process.exitCode = 1;
  }

  const teste = await verificarUpdateEmMassa(db, empresasAfetadas);
  console.log(
    `UPDATE em massa (o que quebrava a sync): ${teste.ok ? 'OK' : 'FALHOU'} — ${teste.detalhe}`,
  );
  console.log(
    `  (nas ${empresasAfetadas.length} empresa(s) que tinham duplicata)`,
  );
  if (!teste.ok) {
    console.log(
      'O REINDEX rodou mas o UPDATE ainda falha — NÃO considerar corrigido.',
    );
    process.exitCode = 1;
  }

  await auditarOutrosIndicesUnicos(db);
  await db.end();
}

main().catch((erro) => {
  console.error(erro?.message ?? erro);
  process.exit(1);
});
