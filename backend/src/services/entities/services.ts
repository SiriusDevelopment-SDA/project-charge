
import { IsString } from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany
} from 'typeorm';
import { Client } from '../../clients/entities.ts/clients';
import { Invoice } from '../../invoices/entities/invoices';
import { Company } from '../../companies/entities/companies';

@Entity()
export class Service {

  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @IsString()
  @Column()
  id_servico!: string

  @IsString()
  @Column()
  status!: string

  @IsString()
  @Column()
  name!: string

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column()
  clientId!: string;

  @ManyToOne(() => Client, (client) => client.services, { nullable: false })
  @JoinColumn({
    name: 'clientId',
    referencedColumnName: 'id',
  })
  client!: Client;
  
  @ManyToOne(() => Company, (company) => company.services, { nullable: false })
  @JoinColumn({
    name: 'companyId',
    referencedColumnName: 'id',
  })
  company!: Company;
}