import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToMany,
  Index
} from 'typeorm';
import { Service } from '../../services/entities/services';
import { Company } from '../../companies/entities/companies';
import { Invoice } from '../../invoices/entities/invoices';
import { Campaign } from '../../campaigns/entities/campanhas.entity';

@Index(['cnpj_cpf', 'companyId'], { unique: true })
@Entity()
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  cnpj_cpf!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  street?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  numberHouse?: string;

  @Column({ length: 9, nullable: true })
  zipCode?: string;

  @Column()
  clientId!: string;

  @Column()
  whatsapp!: string;

  @Column({ nullable: true })
  email?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  invoiceSnapshotCheckedAt?: Date | null;

  @OneToMany(() => Invoice, (invoice) => invoice.client)
  invoices!: Invoice[];

  @OneToMany(() => Service, (service) => service.client)
  services!: Service[];

  @Column()
  companyId!: string;

  @ManyToOne(() => Company, (company) => company.clients)
  @JoinColumn({
    name: 'companyId',
    referencedColumnName: 'id',
  })
  company!: Company;

  @ManyToMany(() => Campaign, (campaign) => campaign.clients)
  campaigns!: Campaign[];
}
