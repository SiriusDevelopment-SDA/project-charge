import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Templates } from '../../templates/entities/templatesMeta';
import { Company } from '../../companies/entities/companies';
import { Client } from '../../clients/entities.ts/clients';
import { Category } from '../../category/entities/category.entity';
import { TemplateMapVar } from '../types';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @ManyToOne(() => Company, (company) => company.campaigns, { nullable: false })
  @JoinColumn({ name: 'company' })
  company!: Company;

  @ManyToOne(() => Templates, (template) => template.campaigns)
  @JoinColumn({ name: 'template' })
  template!: Templates;

  @Column({ type: 'timestamp' })
  startDate!: Date;

  @Column({ type: 'timestamp' })
  endDate!: Date;

  @Column()
  dispatchTime!: string;

  @Column({ default: 'America/Sao_Paulo' })
  timezone!: string;

  @Column({ default: false })
  recurring!: boolean;

  @Column({ type: 'varchar', default: 'single', nullable: true })
  recurringType!: 'single' | 'range' | 'monthly_days';

  @Column({ type: 'jsonb', nullable: true })
  recurringDays?: Array<number | string> | null;

  @ManyToMany(() => Client, (client) => client.campaigns)
  @JoinTable({
    name: 'campaign_clients',
    joinColumn: {
      name: 'campaignId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'clientId',
      referencedColumnName: 'id',
    },
  })
  clients!: Client[];

  @ManyToOne(() => Category, (category) => category.campaigns, { nullable: true })
  @JoinColumn({ name: 'category' })
  category!: Category;

  @Column({ type: 'jsonb', nullable: true })
  templateMapVars!: TemplateMapVar[];

  @Column({ type: 'varchar', default: 'queue' })
  status!: 'queue' | 'pending' | 'running' | 'finished';

  @Column({ default: true })
  isEnabled!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastDispatchedAt?: Date | null;

  @CreateDateColumn({ default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
