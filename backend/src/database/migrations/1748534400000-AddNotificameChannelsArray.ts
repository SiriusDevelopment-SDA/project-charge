import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MC1 — Multi-canal NotificaMe.
 *
 * Converte `company.canalId_notificameHub` de varchar para jsonb (array de
 * canais). Preserva os dados existentes:
 *   - canal não vazio  -> [{ "id": "<valor>", "numero": "" }]
 *   - canal vazio/null -> []
 *
 * O canal guarda apenas { id, numero }. O X-Api-Token de envio continua sendo
 * a coluna compartilhada `token_notificameHub`, que permanece intacta na
 * tabela. Usa uma coluna temporária para a conversão (mais seguro que
 * ALTER ... USING com expressão complexa) e depois renomeia.
 */
export class AddNotificameChannelsArray1748534400000
  implements MigrationInterface
{
  name = 'AddNotificameChannelsArray1748534400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Coluna temporária jsonb com default '[]'
    await queryRunner.query(
      `ALTER TABLE "company" ADD COLUMN "canalId_notificameHub_jsonb" jsonb NOT NULL DEFAULT '[]'`,
    );

    // 2. Popula a temporária a partir do varchar atual.
    //    Trata NULL/string vazia (após trim) como array vazio.
    await queryRunner.query(`
      UPDATE "company"
      SET "canalId_notificameHub_jsonb" = CASE
        WHEN "canalId_notificameHub" IS NULL
          OR btrim("canalId_notificameHub") = ''
        THEN '[]'::jsonb
        ELSE jsonb_build_array(
          jsonb_build_object(
            'id', "canalId_notificameHub",
            'numero', ''
          )
        )
      END
    `);

    // 3. Remove a coluna varchar antiga e renomeia a temporária.
    await queryRunner.query(
      `ALTER TABLE "company" DROP COLUMN "canalId_notificameHub"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company" RENAME COLUMN "canalId_notificameHub_jsonb" TO "canalId_notificameHub"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Coluna temporária varchar (nullable — alinhado ao estado original).
    await queryRunner.query(
      `ALTER TABLE "company" ADD COLUMN "canalId_notificameHub_varchar" character varying`,
    );

    // 2. Reverte pegando o `id` do 1º canal do array (se houver).
    await queryRunner.query(`
      UPDATE "company"
      SET "canalId_notificameHub_varchar" = CASE
        WHEN jsonb_typeof("canalId_notificameHub") = 'array'
          AND jsonb_array_length("canalId_notificameHub") > 0
        THEN "canalId_notificameHub" -> 0 ->> 'id'
        ELSE NULL
      END
    `);

    // 3. Remove a jsonb e renomeia a varchar de volta.
    await queryRunner.query(
      `ALTER TABLE "company" DROP COLUMN "canalId_notificameHub"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company" RENAME COLUMN "canalId_notificameHub_varchar" TO "canalId_notificameHub"`,
    );
  }
}
