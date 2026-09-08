import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Torna `company.cnpj` e `company.token_notificameHub` NOT NULL.
 *
 * POR QUE
 *
 * Os dois campos são consumidos pelo disparo de template e a falta deles não
 * aparece no cadastro — aparece na primeira campanha:
 *
 *   token_notificameHub NULL -> o worker aborta a mensagem com "Empresa sem
 *                               integração NotificaMe configurada"
 *   cnpj NULL                -> `resolverChavePix` (companies/config.contract.ts)
 *                               não acha chave de recebimento e o botão PIX do
 *                               WhatsApp sai sem `key`; a Meta recusa DEPOIS de
 *                               o disparo ter sido aceito como `queued`
 *
 * ESTA MIGRATION NÃO PREENCHE NADA
 *
 * Não há backfill aqui, e isso é deliberado. CNPJ é dado real da empresa: não
 * existe valor padrão, e um placeholder (zeros, o CNPJ de outra empresa) seria
 * pior que o NULL — passaria no NOT NULL, viraria chave PIX, e a cobrança
 * seguiria para lugar nenhum sem ninguém perceber. Os CNPJs que faltam precisam
 * ser preenchidos ANTES, um a um, com o número real de cada provedor.
 *
 * Por isso o `up()` começa conferindo e SE RECUSA a rodar com dado incompleto,
 * nomeando as empresas que faltam. Sem essa checagem o Postgres devolveria
 *
 *   ERROR: column "cnpj" of relation "company" contains null values
 *
 * que diz que existe problema e não diz onde — justamente a informação de que
 * quem está rodando o deploy precisa.
 *
 * O QUE ESTA MIGRATION NÃO TOCA
 *
 * `canalId_notificameHub`. A exigência de ao menos um canal vale só para
 * cadastro novo (`CreateCompanyDto`) e NÃO foi aplicada retroativamente: há
 * empresa cadastrada com zero canais, e o que fazer com ela é decisão de
 * negócio, não de migration.
 *
 * COMO PREENCHER O QUE FALTA (rodar antes desta migration)
 *
 *   SELECT id, name, account_chatwoot FROM company
 *    WHERE cnpj IS NULL OR btrim(cnpj) = '';
 *
 *   UPDATE company SET cnpj = '<14 dígitos reais>' WHERE id = '<uuid>';
 *
 * CUSTO / LOCK
 *
 * `SET NOT NULL` faz varredura completa da tabela sob ACCESS EXCLUSIVE. Em
 * `company` (dezenas de linhas) é instantâneo. Reversível: o `down()` volta os
 * dois para NULL permitido. O backfill NÃO é revertido — apagar CNPJ real de
 * volta para NULL seria perda de dado, não rollback.
 */
export class RequireCompanyCnpjAndNotificameToken1788220800000
  implements MigrationInterface
{
  name = 'RequireCompanyCnpjAndNotificameToken1788220800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // As duas conferências rodam ANTES de qualquer ALTER: se faltar dado, a
    // migration para sem ter mexido no schema.
    await this.exigirPreenchido(
      queryRunner,
      'cnpj',
      'É a chave PIX de recebimento da empresa. Preencha com os 14 dígitos reais — nunca zeros nem placeholder.',
    );
    await this.exigirPreenchido(
      queryRunner,
      'token_notificameHub',
      'É o X-Api-Token da conta NotificaMe. Sem ele a empresa não dispara nenhuma mensagem.',
    );

    await this.avisarCnpjMalFormado(queryRunner);

    await queryRunner.query(
      `ALTER TABLE "company" ALTER COLUMN "cnpj" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "company" ALTER COLUMN "token_notificameHub" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company" ALTER COLUMN "token_notificameHub" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "company" ALTER COLUMN "cnpj" DROP NOT NULL`,
    );
  }

  /**
   * Recusa a migration nomeando as empresas com a coluna NULL ou vazia.
   *
   * Vazio conta como faltando: `''` satisfaria o NOT NULL e continuaria sem
   * servir para nada — chave PIX vazia e token vazio falham exatamente como o
   * NULL, só que sem o banco avisar.
   *
   * A checagem é mantida para `token_notificameHub` mesmo com todas as empresas
   * preenchidas no ambiente local. Produção pode divergir, e é lá que a
   * mensagem críptica do Postgres custa caro.
   */
  private async exigirPreenchido(
    queryRunner: QueryRunner,
    coluna: 'cnpj' | 'token_notificameHub',
    comoResolver: string,
  ): Promise<void> {
    const pendentes: Array<{ id: string; name: string }> =
      await queryRunner.query(
        `SELECT "id", "name" FROM "company"
          WHERE "${coluna}" IS NULL OR btrim("${coluna}") = ''
          ORDER BY "name"`,
      );

    if (pendentes.length === 0) return;

    const lista = pendentes
      .map((empresa) => `  - ${empresa.name} (id ${empresa.id})`)
      .join('\n');

    throw new Error(
      [
        `Migration interrompida: ${pendentes.length} empresa(s) sem "${coluna}".`,
        '',
        'Nada foi alterado no schema. Preencha as empresas abaixo e rode de novo:',
        '',
        lista,
        '',
        comoResolver,
        `UPDATE "company" SET "${coluna}" = '<valor real>' WHERE "id" = '<uuid>';`,
      ].join('\n'),
    );
  }

  /**
   * Avisa (sem bloquear) sobre CNPJ que está preenchido mas não tem 14 dígitos.
   *
   * Não bloqueia de propósito: CNPJ gravado com pontuação continua funcionando
   * — `resolverChavePix` faz `replace(/\D/g, '')` antes de usar. Bloquear aqui
   * pararia um deploy por um dado que funciona. Mas um valor com número errado
   * de dígitos vira chave PIX inválida, então precisa ficar visível.
   */
  private async avisarCnpjMalFormado(queryRunner: QueryRunner): Promise<void> {
    const suspeitas: Array<{ name: string; digitos: string }> =
      await queryRunner.query(
        `SELECT "name", length(regexp_replace("cnpj", '\\D', '', 'g'))::text AS digitos
           FROM "company"
          WHERE "cnpj" IS NOT NULL
            AND btrim("cnpj") <> ''
            AND length(regexp_replace("cnpj", '\\D', '', 'g')) <> 14
          ORDER BY "name"`,
      );

    if (suspeitas.length === 0) return;

    console.warn(
      [
        `[RequireCompanyCnpjAndNotificameToken] AVISO: ${suspeitas.length} empresa(s) com CNPJ fora de 14 dígitos.`,
        'A migration segue (o valor não é NULL), mas esse CNPJ não serve como chave PIX:',
        ...suspeitas.map((s) => `  - ${s.name} (${s.digitos} dígitos)`),
      ].join('\n'),
    );
  }
}
