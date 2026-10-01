import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/companies';

export const AGENT_ROLES = ['admin', 'operator', 'super_admin'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

@Entity('agents')
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column({ type: 'integer', nullable: true })
  chatwootUserId!: number | null;

  @Column({ type: 'varchar', nullable: true })
  chatwootAccessToken!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'admin',
  })
  role!: AgentRole;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  /**
   * A senha atual ainda e a INICIAL, entregue no cadastro automatico do embed.
   *
   * Enquanto for `true`, o agente autentica mas nao opera: o `JwtAuthGuard` so
   * libera a troca de senha. E o que impede a senha inicial — que e a mesma para
   * todo mundo — de virar senha permanente de quem nunca faz login por senha.
   *
   * `false` para todos os agentes anteriores a esta coluna: eles tem hash
   * proprio. Ver a migration `AddMustChangePasswordToAgents`.
   */
  @Column({ type: 'boolean', default: false })
  mustChangePassword!: boolean;

  @ManyToOne(() => Company, (company) => company.agents, { nullable: false })
  @JoinColumn({ name: 'companyId' })
  company!: Company;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
