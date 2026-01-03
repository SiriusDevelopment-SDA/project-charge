
import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    UpdateDateColumn,
    ManyToOne,
    PrimaryColumn
  } from 'typeorm';
import { Company } from '../../companies/entities/companies';
  
  @Entity()
  export class Templates {

    @PrimaryColumn()
    id!: string
  
    @Column()
    name!: string;

    @Column()
    message!: string;

    @Column({ default: 'GERAL' })
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