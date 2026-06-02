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

  @ManyToOne(() => Company, (company) => company.agents, { nullable: false })
  @JoinColumn({ name: 'companyId' })
  company!: Company;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
