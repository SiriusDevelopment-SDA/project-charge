
import { IsString } from 'class-validator';
import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    OneToMany
  } from 'typeorm';
import { Client } from '../../clients/entities.ts/clients';
import { Invoice } from '../../invoices/entities/invoices';
import { Service } from '../../services/entities/services';
import { Templates } from '../../templates/entities/templatesMeta';
import { RelatoryDispatchTemplate } from '../../templates/entities/relatory.entity';
import { Campaign } from '../../campanhas/entities/campanhas.entity';
import { Agent } from '../../agents/entities/agent.entity';
  
  @Entity()
  export class Company {
    
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @IsString()
    @Column()
    name!: string;

    @IsString()
    @Column()
    url!: string;

    @IsString()
    @Column({ nullable: true })
    autorization!: string;

    @Column({
      type: 'jsonb',
      default: () => "'{}'",
    })
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
    @Column({ nullable: true })
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

    @Column({ default: true })
    active!: boolean;
    
    @OneToMany(() => Service, (service) => service.company, { nullable: false })
    services!: Service[];

    @OneToMany(() => Client, (client) => client.company, { nullable: false })
    clients!: Client[];

    @OneToMany(() => Invoice, (invoice) => invoice.company, { nullable: false })
    invoices!: Invoice[];

    @OneToMany(() => Templates, (template) => template.company, { nullable: false })
    templates!: Templates[];

    @OneToMany(() => RelatoryDispatchTemplate, (relatory) => relatory.company, { nullable: false })
    relatories!: RelatoryDispatchTemplate[];

    @OneToMany(() => Campaign, (campaign) => campaign.company, { nullable: true })
    campaigns!: Campaign[] | null;

    @OneToMany(() => Agent, (agent) => agent.company, { nullable: true })
    agents!: Agent[] | null;
  }
