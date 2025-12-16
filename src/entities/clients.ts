
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne
} from 'typeorm';
import { Invoice } from './invoices';
import { Service } from './services';
import { Company } from './companies';
import { Templates } from './templatesMeta';

@Entity()
export class Client {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ unique: true })
  cnpj_cpf!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  street?: string;

  @Column()
  city?: string;

  @Column()
  numberHouse?: string;

  @Column({ length: 9 })
  zipCode?: string;

  @Column()
  clientId!: string;

  @Column({ unique: true })
  whatsapp!: string;

  @Column()
  email?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Invoice, (invoice) => invoice.client)
  invoices!: Invoice[];

  @OneToMany(() => Service, (service) => service.client)
  services!: Service[];

  @ManyToOne(() => Company, (company) => company.clients)
    @JoinColumn({
      name: 'companyId',
      referencedColumnName: 'id',
    })
  company!: Company;

  @OneToMany(() => Templates, (template) => template.client)
  templates!: Templates[];
}