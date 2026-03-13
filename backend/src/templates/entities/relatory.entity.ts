import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Templates } from './templatesMeta';
import { Company } from '../../companies/entities/companies';
import { Campaign } from '../../campaigns/entities/campanhas.entity';
import { TemplateDispatchBatch } from './template-dispatch-batch.entity';


@Entity()
export class RelatoryDispatchTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true })
  external_message_id?: string;

  @Column()
  name!: string;

  @Column()
  number!: string;

  @Column()
  date_dispatch!: Date;

  @Column({ type: 'varchar', default: 'queued' })
  status_sent!: 'queued' | 'delivered' | 'sent' | 'read' | 'failed' | 'pending' | 'error';

  @Column({ type: 'text', nullable: true })
  message?: string | null;

  @ManyToOne(() => Templates, (template: Templates) => template.relatories)
  @JoinColumn({ name: 'templateId' })
  template!: Templates;

  @Column({ default: false })
  response!: boolean;

  @Column({ nullable: true, type: 'timestamp' })
  response_at?: Date | null;

  @Column({
    type: 'jsonb',
    default: () => "'{}'",
  })
  components_maped!: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Company, (company) => company.relatories)
  @JoinColumn({ name: 'companyId' })
  company!: Company;

  @ManyToOne(() => Campaign, { nullable: true })
  @JoinColumn({ name: 'campaignId' })
  campaign?: Campaign | null;

  @ManyToOne(() => TemplateDispatchBatch, { nullable: true })
  @JoinColumn({ name: 'dispatchBatchId' })
  dispatchBatch?: TemplateDispatchBatch | null;
}
