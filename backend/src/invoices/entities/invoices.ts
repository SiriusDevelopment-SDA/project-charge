import { IsString } from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';

@Entity()
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @IsString()
  @Column()
  value!: string;

  @IsString()
  @Column({ nullable: true })
  id_fatura!: string;

  @IsString()
  @Column({ nullable: true })
  contractId!: string;

  @IsString()
  @Column()
  status!: string

  @IsString()
  @Column()
  expiration!: string;

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

