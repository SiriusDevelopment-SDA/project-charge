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
import { Templates } from '../../templates/entities/templatesMeta';
import { Campaign } from '../../campaigns/entities/campanhas.entity';
import { DispatchBatch } from './dispatch-batch.entity';

export type MessageQueueStatus = 'pending' | 'processing' | 'sent' | 'failed';

export type MessageQueuePayload = {
  number: string;
  name?: string;
  components: Array<{
    type: string;
    parameters?: Array<Record<string, unknown>>;
    sub_type?: string;
    index?: number;
    [key: string]: unknown;
  }>;
};

@Entity('message_queue')
export class MessageQueue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Company, { nullable: false })
  @JoinColumn({ name: 'companyId' })
  company!: Company;

  @Column()
  companyId!: string;

  @ManyToOne(() => Templates, { nullable: false })
  @JoinColumn({ name: 'templateId' })
  template!: Templates;

  @Column()
  templateId!: string;

  @ManyToOne(() => Campaign, { nullable: true })
  @JoinColumn({ name: 'campaignId' })
  campaign?: Campaign | null;

  @Column({ type: 'varchar', nullable: true })
  campaignId?: string | null;

  @ManyToOne(() => DispatchBatch, { nullable: true })
  @JoinColumn({ name: 'batchId' })
  batch?: DispatchBatch | null;

  @Column({ type: 'varchar', nullable: true })
  batchId?: string | null;

  @Column({ type: 'jsonb' })
  payload!: MessageQueuePayload;

  @Column({ type: 'varchar', default: 'pending' })
  status!: MessageQueueStatus;

  @Column({ default: 0 })
  attempts!: number;

  @Column({ type: 'timestamp' })
  scheduledAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
