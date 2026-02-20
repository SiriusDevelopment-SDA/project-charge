import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
  OneToOne,
} from 'typeorm';
import { Templates } from '../../templates/entities/templatesMeta';
import { Company } from '../../companies/entities/companies';
import { Client } from '../../clients/entities.ts/clients';
import { Category } from '../../category/entities/category.entity';

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
  dispatchStartTime!: string;

  @Column()
  dispatchEndTime!: string;

  @Column({ default: 'America/Sao_Paulo' })
  timezone!: string;

  @Column({ default: false })
  recurring!: boolean;

  @ManyToMany(() => Client, (client) => client.campaigns)
  @JoinTable({
    name: 'campaign_clients',
    joinColumn: {
      name: 'campaignId',
      referencedColumnName: 'id'
    },
    inverseJoinColumn: {
      name: 'clientId',
      referencedColumnName: 'id'
    },
  })
  client!: Client[];

  @ManyToOne(() => Category, (category) => category.campaigns, { nullable: true })
  @JoinColumn({ name: 'category' })
  category!: Category;

  @Column({ default: 'pending' })
  status!: 'pending' | 'running' | 'finished';

  @Column({ default: true })
  isEnabled!: boolean;

  @CreateDateColumn({ default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
