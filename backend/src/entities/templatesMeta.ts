
import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    ManyToOne
  } from 'typeorm';
import { Client } from './clients';
  
  @Entity()
  export class Templates {
    @PrimaryGeneratedColumn()
    id!: number
  
    @Column()
    name!: string;

    @Column()
    message!: string;

    @Column()
    category!: string;

    @Column()
    active!: boolean;

    @CreateDateColumn()
    createdAt!: Date;
  
    @UpdateDateColumn()
    updatedAt!: Date;
  
    @ManyToOne(() => Client, (client) => client.templates, { nullable: false })
    @JoinColumn({
      name: 'client',
      referencedColumnName: 'cnpj_cpf',
    })
    client!: Client;
  }