import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Histórico geral (auditoria de atividades). Cria a tabela `activity_log`:
 * 1 linha por ação de usuário (criar/editar/excluir/executar). Autor
 * desnormalizado (agent_email/name) para sobreviver à remoção do agente e não
 * pagar join na listagem. Índices por (company_id, created_at) e
 * (company_id, category) para a listagem filtrada/paginada por empresa.
 *
 * Só ADD/CREATE — operação segura, sem perda de dados.
 */
export class CreateActivityLog1786924800000 implements MigrationInterface {
  name = 'CreateActivityLog1786924800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activity_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid,
        "agent_id" uuid,
        "agent_email" character varying(180),
        "agent_name" character varying(180),
        "category" character varying(20) NOT NULL,
        "action" character varying(180) NOT NULL,
        "entity" character varying(60),
        "entity_id" character varying(120),
        "method" character varying(10),
        "path" character varying(255),
        "status_code" integer,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_activity_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_activity_company_created" ON "activity_log" ("company_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_activity_company_category" ON "activity_log" ("company_id", "category")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_activity_company_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_activity_company_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_log"`);
  }
}
