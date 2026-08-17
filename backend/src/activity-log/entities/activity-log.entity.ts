import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Categorias de ação do histórico geral (auditoria). Mapeiam o que o usuário
 * fez: criar (adicionou algo), edit (alterou), delete (removeu), execute
 * (disparou/sincronizou/rodou algo), auth (login/troca de empresa). `other`
 * é defesa para casos não classificados.
 */
export type ActivityCategory =
  | 'create'
  | 'edit'
  | 'delete'
  | 'execute'
  | 'auth'
  | 'other';

/**
 * Registro de auditoria: 1 linha por ação de usuário. Dados do autor
 * (agent_email/name) ficam DESNORMALIZADOS de propósito — o histórico precisa
 * sobreviver mesmo que o agente seja removido, e a listagem não paga join.
 * Escopo multi-empresa por `company_id` (mesma regra do resto do sistema).
 */
@Entity({ name: 'activity_log' })
@Index('idx_activity_company_created', ['companyId', 'createdAt'])
@Index('idx_activity_company_category', ['companyId', 'category'])
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId?: string | null;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId?: string | null;

  @Column({ name: 'agent_email', type: 'varchar', length: 180, nullable: true })
  agentEmail?: string | null;

  @Column({ name: 'agent_name', type: 'varchar', length: 180, nullable: true })
  agentName?: string | null;

  @Column({ name: 'category', type: 'varchar', length: 20 })
  category!: ActivityCategory;

  /** Rótulo legível: "Disparou campanha", "Editou template", etc. */
  @Column({ name: 'action', type: 'varchar', length: 180 })
  action!: string;

  /** Tipo do alvo: campaign, template, agent, client, invoice, etc. */
  @Column({ name: 'entity', type: 'varchar', length: 60, nullable: true })
  entity?: string | null;

  @Column({ name: 'entity_id', type: 'varchar', length: 120, nullable: true })
  entityId?: string | null;

  @Column({ name: 'method', type: 'varchar', length: 10, nullable: true })
  method?: string | null;

  @Column({ name: 'path', type: 'varchar', length: 255, nullable: true })
  path?: string | null;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode?: number | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
