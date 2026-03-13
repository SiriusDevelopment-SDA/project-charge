import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Templates } from './templatesMeta';
import { Company } from '../../companies/entities/companies';
import { Campaign } from '../../campaigns/entities/campanhas.entity';
import { ToComponentDto } from '../dto/search.request.dto.templates';

export type TemplateDispatchBatchStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed';

type TemplateDispatchBatchPayload = {
  recipients: ToComponentDto[];
};

@Entity()
export class TemplateDispatchBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  account!: string;

  @Column({
    type: 'varchar',
    default: 'queued',
  })
  status!: TemplateDispatchBatchStatus;

  @Column({ type: 'int', default: 0 })
  totalRecipients!: number;

  @Column({ type: 'int', default: 0 })
  processedRecipients!: number;

  @Column({ type: 'int', default: 0 })
  successCount!: number;

  @Column({ type: 'int', default: 0 })
  failedCount!: number;

  @Column({ type: 'int', default: 15 })
  rateLimitPerSecond!: number;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload!: TemplateDispatchBatchPayload;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @ManyToOne(() => Templates, { nullable: false })
  @JoinColumn({ name: 'templateId' })
  template!: Templates;

  @ManyToOne(() => Company, { nullable: false })
  @JoinColumn({ name: 'companyId' })
  company!: Company;

  @ManyToOne(() => Campaign, { nullable: true })
  @JoinColumn({ name: 'campaignId' })
  campaign?: Campaign | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
