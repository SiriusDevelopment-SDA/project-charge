import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona `agents.mustChangePassword`.
 *
 * POR QUE
 *
 * O embed passou a CADASTRAR sozinho o agente que ainda nao existe no Vital
 * (ver `provisionarAgenteDoChatwoot`). Ate agora esse agente nascia com
 * `passwordHash: 'CHATWOOT_AUTH'` — um texto fixo, nao um hash. O `loginAgent`
 * compara com bcrypt, e bcrypt contra um nao-hash sempre falha: na pratica ele
 * so conseguia entrar pelo embed.
 *
 * A decisao de produto e que ele nasca com uma senha inicial conhecida e a
 * troque no primeiro acesso. Isso exige saber se a senha AINDA e a inicial — e
 * essa e a unica coisa que esta coluna guarda.
 *
 * ELA E O QUE TORNA A SENHA INICIAL ACEITAVEL
 *
 * A senha inicial e a mesma para todo mundo, entao ela e um segredo
 * compartilhado: quem a souber e souber um e-mail entra como aquela pessoa.
 * O que limita o estrago e a obrigatoriedade da troca, e a obrigatoriedade
 * depende desta flag. Sem ela, a senha inicial vira senha permanente de quem
 * nunca fizer login por senha — que e a maioria, porque o caminho normal desses
 * agentes e o embed.
 *
 * SEM BACKFILL, DE PROPOSITO
 *
 * `DEFAULT false` para os 119 agentes que ja existem. Eles tem hash bcrypt de
 * verdade — seja senha escolhida por eles, seja importada do Maestro — e marcar
 * `true` obrigaria toda a base a trocar a senha no proximo acesso por causa de
 * uma migration. A flag so passa a valer para quem for criado daqui em diante.
 *
 * O `DEFAULT false` fica na coluna (nao so no `create` da entidade) porque
 * outros caminhos inserem agente sem passar por ela: o sync do Maestro e o
 * `createAgent` do painel.
 */
export class AddMustChangePasswordToAgents1789344000000
  implements MigrationInterface
{
  name = 'AddMustChangePasswordToAgents1789344000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverter derruba a exigencia de troca de quem foi criado com a senha
    // inicial: esses agentes ficam com `Vital@2026` valendo indefinidamente.
    // Antes de reverter em producao, troque a senha deles.
    await queryRunner.query(
      `ALTER TABLE "agents" DROP COLUMN IF EXISTS "mustChangePassword"`,
    );
  }
}
