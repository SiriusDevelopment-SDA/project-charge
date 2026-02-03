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

  @Column()
  status_sent!: string;

  @Column({ nullable: true })
  message!: string;

  @ManyToOne(() => Templates, (template: Templates) => template.relatories)
  @JoinColumn({ name: 'templateId' })
  template!: Templates;

  @Column({ default: false })
  response!: boolean;

  @Column({
    type: 'jsonb',
    default: () => "'{}'",
  })
  components_maped!: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ nullable: true })
  providerMessageId!: string

  @ManyToOne(() => Company, (company) => company.relatories)
  @JoinColumn({ name: 'companyId' })
  company!: Company;
}
