
import { IsNotEmpty, IsNumber, isObject, IsString } from 'class-validator';
import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    OneToMany
  } from 'typeorm';
import { Client } from './clients';
import { Invoice } from './invoices';
import { Service } from './services';
  
  @Entity()
  export class Company {
    
    @PrimaryGeneratedColumn()
    id!: number;

    @IsString()
    @Column()
    name!: string;

    @IsString()
    @Column()
    url!: string;

    @IsString()
    @Column()
    autorization!: string;

    @Column({ type: 'jsonb' })
    config!: Record<string, any>;

    @IsString()
    @Column()
    token_system_coraxy!: string;

    @IsString()
    @Column()
    account_chatwoot!: string;

    @IsString()
    @Column()
    erp!: string;

    @IsString()
    @Column()
    table_vector!: string;

    @IsString()
    @Column()
    responsible!: string;
    
    @IsString()
    @Column()
    label!: string;

    @IsString()
    @Column()
    total_active_customers!: string;

    @IsString()
    @Column()
    canalId_notificameHub!: string;

    @IsString()
    @Column()
    token_notificameHub!: string;

    @IsString()
    @Column()
    acess_token_agentbot_chatwoot!: string;

    @IsString()
    @Column()
    downtime!: string;

    @CreateDateColumn()
    createdAt!: Date;
    
    @UpdateDateColumn()
    updatedAt!: Date;
    
    @OneToMany(() => Service, (service) => service.company, { nullable: false })
    services!: Service[];

    @OneToMany(() => Client, (client) => client.company, { nullable: false })
    clients!: Client[];

    @OneToMany(() => Invoice, (invoice) => invoice.company, { nullable: false })
    invoices!: Invoice[];
  }