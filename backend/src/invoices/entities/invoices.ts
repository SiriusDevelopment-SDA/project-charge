import { IsString } from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';

@Entity()
@Unique(['id_fatura', 'company'])
@Index(['status', 'expiration'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @IsString()
  @Column()
  value!: string;

  @IsString()
  @Column({ type: 'varchar', nullable: true })
  id_fatura!: string;

  @IsString()
  @Column({ type: 'varchar', nullable: true })
  contractId!: string;

  @IsString()
  @Column()
  status!: string

  @Column({ type: 'text', nullable: true })
  ticketDigitableLine?: string | null;

  @Column({ type: 'text', nullable: true })
  ticketPdfLink?: string | null;

  @Column({ type: 'text', nullable: true })
  pixCode?: string | null;

  @IsString()
  @Column()
  expiration!: string;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Client, (client) => client.invoices, { nullable: false })
  @JoinColumn({
    name: 'client',
    referencedColumnName: 'cnpj_cpf',
  })
  client!: Client;
  // @ManyToOne(() => Service, (service) => service.invoices)
  // @JoinColumn({
  //   name: 'serviceId',
  //   referencedColumnName: 'id',
  // })
  // service?: Service;

  @ManyToOne(() => Company, (company) => company.invoices)
  @JoinColumn({
    name: 'companyId',
    referencedColumnName: 'id',
  })
  company!: Company;
}
