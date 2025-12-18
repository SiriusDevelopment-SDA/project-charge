
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    ManyToOne,
    ManyToMany,
    OneToMany
  } from 'typeorm';
import { Client } from './clients';
import { Invoice } from './invoices';
import { Company } from './companies';
  
  @Entity()
  export class Service {
    
    @PrimaryGeneratedColumn("uuid")
    id!: number;

    @IsString()
    @Column()
    cnpj_cpf!: string

    @IsString()
    @Column()
    value!: string

    @IsString()
    @Column()
    name!: string

    @CreateDateColumn()
    createdAt!: Date;
    
    @UpdateDateColumn()
    updatedAt!: Date;
    
    @ManyToOne(() => Client, (client) => client.services, { nullable: false })
    @JoinColumn({
      name: 'client',
      referencedColumnName: 'cnpj_cpf',
    })
    client!: Client;

    @OneToMany(() => Invoice, (invoice) => invoice.service, { nullable: false })
    invoices!: Invoice[];

    @ManyToOne(() => Company, (company) => company.services, { nullable: false })
    @JoinColumn({
      name: 'companyId',
      referencedColumnName: 'id',
    })
    company!: Company;
  }