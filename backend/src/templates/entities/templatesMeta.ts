import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  OneToMany,
} from 'typeorm';
import { Company } from '../../companies/entities/companies';
import { RelatoryDispatchTemplate } from './relatory.entity';
import { Campaign } from '../../campaigns/entities/campanhas.entity';

@Entity()
export class Templates {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true, unique: true })
  meta_id!: string;

  @Column()
  name!: string;

  @Column()
  message!: string;

  @Column({ default: 'Categoria indefinida' })
  category!: string;

  @Column()
  active!: boolean;

  @Column({ default: 'pt_BR' })
  language!: string;

  @Column({ default: 'Não encontrado' })
  meta_status!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Company, (company) => company.templates)
  @JoinColumn({ name: 'companyId' })
  company!: Company;

  @OneToMany(
    () => RelatoryDispatchTemplate,
    (relatory: RelatoryDispatchTemplate) => relatory.template
  )
  relatories!: RelatoryDispatchTemplate[];

  @Column({
    type: 'jsonb',
    default: () => "'{}'",
  })
  variables!: Record<string, any>;

  @Column({
    type: 'jsonb',
    default: () => "'[]'",
  })
  components!: Record<string, any>[];

  @Column({ default: true })
  isEnabled!: boolean;

  @OneToMany(() => Campaign, (campaign) => campaign.template)
  campaigns!: Campaign[];
}
