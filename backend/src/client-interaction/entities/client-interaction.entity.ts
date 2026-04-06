import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities.ts/clients';
import { Agent } from '../../agents/entities/agent.entity';

export type InteractionType = 'call' | 'whatsapp' | 'email' | 'visit' | 'other';
export type InteractionOutcome =
  | 'payment_promise'
  | 'no_contact'
  | 'agreement'
  | 'refused'
  | 'other';

@Entity({ name: 'client_interaction' })
export class ClientInteraction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Client, { nullable: false })
  @JoinColumn({ name: 'client_id' })
  client!: Client;

  @Column({ name: 'client_id' })
  client_id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  company_id!: string;

  @ManyToOne(() => Agent, { nullable: true })
  @JoinColumn({ name: 'agent_id' })
  agent?: Agent | null;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agent_id?: string | null;

  @Column({ name: 'type', type: 'varchar', length: 50, nullable: true })
  type?: InteractionType | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'outcome', type: 'varchar', length: 50, nullable: true })
  outcome?: InteractionOutcome | null;

  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
  scheduled_at?: Date | null;

  @Column({ name: 'payment_promise_id', type: 'uuid', nullable: true })
  payment_promise_id?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updated_at?: Date | null;
}
