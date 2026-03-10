import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('overdue')
@Unique(['invoiceId', 'companyId'])
export class Overdue {

  @PrimaryGeneratedColumn('uuid')
  id!: number;

  @Column()
  invoiceId!: string;

  @Column()
  client!: string;

  @Column()
  companyId!: string;

  @Column({ type: 'timestamp' })
  dueDate!: Date;

  @CreateDateColumn()
  createdAt!: Date;

}