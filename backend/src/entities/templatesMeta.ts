
import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    ManyToOne
  } from 'typeorm';
import { Company } from './companies';
  
  @Entity()
  export class Templates {
    @PrimaryGeneratedColumn("uuid")
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
  
    @ManyToOne(() => Company, (company) => company.templates)
    @JoinColumn({
      name: 'companyId',
      referencedColumnName: 'id',
    })
    company!: Company;
  }