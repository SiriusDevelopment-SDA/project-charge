
import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    UpdateDateColumn,
    ManyToOne,
    PrimaryColumn,
    PrimaryGeneratedColumn
  } from 'typeorm';
import { Company } from '../../companies/entities/companies';
  
  @Entity()
  export class Templates {

    @PrimaryGeneratedColumn("uuid")
    id!: string

    @Column({ nullable: true, unique: true })
    meta_id!: string
  
    @Column()
    name!: string;

    @Column()
    message!: string;

    @Column({ default: 'Categoria indefinida' })
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