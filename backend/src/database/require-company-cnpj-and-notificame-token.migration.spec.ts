import type { QueryRunner } from 'typeorm';
import { RequireCompanyCnpjAndNotificameToken1788220800000 } from './migrations/1788220800000-RequireCompanyCnpjAndNotificameToken';

/**
 * A recusa da migration diante de dado incompleto.
 *
 * O comportamento testado aqui vale mais que o `SET NOT NULL` em si. Sem a
 * conferencia, quem roda o deploy recebe do Postgres apenas
 *
 *   ERROR: column "cnpj" of relation "company" contains null values
 *
 * que avisa que existe problema e nao diz onde. Com ela, o erro nomeia as
 * empresas que faltam preencher — que e a unica informacao acionavel no meio de
 * um deploy.
 *
 * O segundo ponto testado: a recusa acontece ANTES de qualquer `ALTER`. Uma
 * migration que altera metade do schema e so entao falha deixa o banco num
 * estado que ninguem pediu.
 *
 * NOTA: este spec fica em `src/database/` e NAO em `src/database/migrations/`
 * de proposito. O `data-source.ts` carrega `migrations/*.{ts,js}` por glob; um
 * `.spec.ts` la dentro seria lido como migration pela CLI do TypeORM.
 */

type Empresa = { id: string; name: string };

/**
 * QueryRunner de mentira: devolve as linhas combinadas para cada uma das tres
 * consultas da migration e grava todo SQL executado, para o teste poder afirmar
 * o que rodou e o que nao rodou.
 */
function runnerFalso(dados: {
  semCnpj?: Empresa[];
  semToken?: Empresa[];
  cnpjMalFormado?: Array<{ name: string; digitos: string }>;
}) {
  const sqls: string[] = [];

  const queryRunner = {
    query: (sql: string): Promise<unknown> => {
      sqls.push(sql);

      if (sql.includes('<> 14')) {
        return Promise.resolve(dados.cnpjMalFormado ?? []);
      }
      if (sql.includes('"cnpj" IS NULL')) {
        return Promise.resolve(dados.semCnpj ?? []);
      }
      if (sql.includes('"token_notificameHub" IS NULL')) {
        return Promise.resolve(dados.semToken ?? []);
      }
      return Promise.resolve([]);
    },
  } as unknown as QueryRunner;

  return { queryRunner, sqls, alters: () => sqls.filter((s) => s.includes('ALTER TABLE')) };
}

const migration = () => new RequireCompanyCnpjAndNotificameToken1788220800000();

describe('migration RequireCompanyCnpjAndNotificameToken: recusa com dado incompleto', () => {
  it('interrompe nomeando cada empresa sem cnpj', async () => {
    const { queryRunner } = runnerFalso({
      semCnpj: [
        { id: 'uuid-adrenalina', name: 'ADRENALINA NET' },
        { id: 'uuid-villanet', name: 'VILLANET' },
      ],
    });

    await expect(migration().up(queryRunner)).rejects.toThrow(
      /ADRENALINA NET[\s\S]*VILLANET/,
    );
  });

  it('diz quantas empresas faltam e como preencher', async () => {
    const { queryRunner } = runnerFalso({
      semCnpj: [{ id: 'uuid-rap10', name: 'RAP 10' }],
    });

    const erro = await migration()
      .up(queryRunner)
      .catch((e: Error) => e);

    const mensagem = (erro as Error).message;
    expect(mensagem).toContain('1 empresa(s) sem "cnpj"');
    expect(mensagem).toContain('uuid-rap10');
    expect(mensagem).toContain('UPDATE "company"');
    expect(mensagem).toContain('Nada foi alterado no schema');
  });

  it('NAO executa nenhum ALTER quando recusa', async () => {
    const { queryRunner, alters } = runnerFalso({
      semCnpj: [{ id: 'uuid-linknet', name: 'LINKNET' }],
    });

    await expect(migration().up(queryRunner)).rejects.toThrow();
    expect(alters()).toEqual([]);
  });

  it('trata cnpj vazio como faltando — a consulta cobre NULL e string vazia', async () => {
    // `''` satisfaria o NOT NULL e continuaria sem servir como chave PIX.
    const { queryRunner, sqls } = runnerFalso({});
    await migration().up(queryRunner);

    expect(sqls[0]).toContain(`btrim("cnpj") = ''`);
    expect(sqls[1]).toContain(`btrim("token_notificameHub") = ''`);
  });

  it('recusa por token mesmo com todos os cnpj preenchidos', async () => {
    // Localmente as 12 empresas tem token, mas producao pode divergir: a
    // checagem defensiva existe para esse caso.
    const { queryRunner, alters } = runnerFalso({
      semToken: [{ id: 'uuid-x', name: 'EMPRESA SEM TOKEN' }],
    });

    await expect(migration().up(queryRunner)).rejects.toThrow(
      /token_notificameHub[\s\S]*EMPRESA SEM TOKEN/,
    );
    expect(alters()).toEqual([]);
  });
});

describe('migration RequireCompanyCnpjAndNotificameToken: aplicacao e reversao', () => {
  it('aplica o NOT NULL nas duas colunas quando tudo esta preenchido', async () => {
    const { queryRunner, alters } = runnerFalso({});

    await migration().up(queryRunner);

    expect(alters()).toEqual([
      'ALTER TABLE "company" ALTER COLUMN "cnpj" SET NOT NULL',
      'ALTER TABLE "company" ALTER COLUMN "token_notificameHub" SET NOT NULL',
    ]);
  });

  it('NAO toca em canalId_notificameHub — a exigencia de canal nao e retroativa', async () => {
    // Ha empresa cadastrada com zero canais e o que fazer com ela e decisao de
    // negocio. A migration nao pode decidir por ela.
    const { queryRunner, sqls } = runnerFalso({});

    await migration().up(queryRunner);

    expect(sqls.join(' ')).not.toContain('canalId_notificameHub');
  });

  it('down() devolve as duas colunas para NULL permitido', async () => {
    const { queryRunner, alters } = runnerFalso({});

    await migration().down(queryRunner);

    expect(alters()).toEqual([
      'ALTER TABLE "company" ALTER COLUMN "token_notificameHub" DROP NOT NULL',
      'ALTER TABLE "company" ALTER COLUMN "cnpj" DROP NOT NULL',
    ]);
  });

  it('down() nao tenta reverter backfill — apagar CNPJ real seria perda de dado', async () => {
    const { queryRunner, sqls } = runnerFalso({});

    await migration().down(queryRunner);

    expect(sqls.join(' ')).not.toContain('UPDATE');
  });
});

describe('migration RequireCompanyCnpjAndNotificameToken: aviso de cnpj mal formado', () => {
  it('avisa sem bloquear quando o cnpj preenchido nao tem 14 digitos', async () => {
    // Nao bloqueia porque CNPJ com pontuacao funciona: `resolverChavePix` faz
    // `replace(/\D/g, '')` antes de usar. Mas contagem errada de digitos vira
    // chave PIX invalida e precisa ficar visivel.
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { queryRunner, alters } = runnerFalso({
      cnpjMalFormado: [{ name: 'EMPRESA TORTA', digitos: '11' }],
    });

    await migration().up(queryRunner);

    expect(alters()).toHaveLength(2);
    expect(aviso.mock.calls[0][0]).toContain('EMPRESA TORTA');

    aviso.mockRestore();
  });
});
