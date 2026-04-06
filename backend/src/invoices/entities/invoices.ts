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

@Index(['id_fatura', 'companyId'], { unique: true })
@Index(['status', 'expiration'])
@Entity()
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

  @Column()
  clientId!: string;

  @ManyToOne(() => Client, (client) => client.invoices)
  @JoinColumn({
    name: 'clientId',
    referencedColumnName: 'id',
  })
  client!: Client;

  @Column()
  companyId!: string;

  @ManyToOne(() => Company, (company) => company.invoices)
  @JoinColumn({
    name: 'companyId',
    referencedColumnName: 'id',
  })
  company!: Company;
}
