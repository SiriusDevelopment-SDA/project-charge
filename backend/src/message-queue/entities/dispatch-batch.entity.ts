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
import { Campaign } from '../../campaigns/entities/campanhas.entity';

export type DispatchBatchStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed';

@Entity('dispatch_batch')
export class DispatchBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Company, { nullable: false })
  @JoinColumn({ name: 'companyId' })
  company!: Company;

  @Column()
  companyId!: string;

  @ManyToOne(() => Campaign, { nullable: true })
  @JoinColumn({ name: 'campaignId' })
  campaign?: Campaign | null;

  @Column({ type: 'varchar', nullable: true })
  campaignId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  templateId?: string | null;

  @Column({ type: 'varchar', default: 'queued' })
  status!: DispatchBatchStatus;

  @Column({ default: 0 })
  totalRecipients!: number;

  @Column({ default: 0 })
  processedRecipients!: number;

  @Column({ type: 'varchar', default: 'manual' })
  scope!: 'manual' | 'campaign';

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
