import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MC2 — Multi-canal NotificaMe.
 *
 * Adiciona a coluna `channelId` (nullable) em:
 *   - `campaigns`     — canal NotificaMe escolhido na campanha.
 *   - `message_queue` — canal propagado ate o worker para selecionar o
 *                       `token`/`from` correto no disparo.
 *
 * Ambas referenciam `Company.canalId_notificameHub[].id`. São nullable:
 * quando null, o worker faz fallback para o primeiro canal da empresa
 * (comportamento MC1). Apenas ADD COLUMN — operacao segura, sem perda de dados.
 */
export class AddChannelIdToCampaignAndQueue1748620800000
  implements MigrationInterface
{
  name = 'AddChannelIdToCampaignAndQueue1748620800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "channelId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_queue" ADD COLUMN IF NOT EXISTS "channelId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "message_queue" DROP COLUMN IF EXISTS "channelId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "channelId"`,
    );
  }
}
