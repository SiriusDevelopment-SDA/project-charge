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

@Entity({ name: 'payment_promise' })
export class PaymentPromise {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Client, { nullable: false })
  @JoinColumn({ name: 'client_id' })
  client!: Client;

  @Column({ name: 'client_id' })
  client_id!: string;

  @Column({ name: 'total_debt', type: 'numeric', precision: 10, scale: 2 })
  total_debt!: number;

  @Column({ name: 'open_invoices_count', type: 'int' })
  open_invoices_count!: number;

  @Column({ name: 'promised_payment_date', type: 'date' })
  promised_payment_date!: string;

  @Column({ name: 'promised_amount', type: 'numeric', precision: 10, scale: 2, nullable: true })
  promised_amount?: number | null;

  @Column({ name: 'reminder_sent', type: 'boolean', default: false })
  reminder_sent!: boolean;

  @Column({ name: 'reminder_sent_at', type: 'timestamp', nullable: true })
  reminder_sent_at?: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status!: 'pending' | 'kept' | 'broken' | 'cancelled';

  @Column({ name: 'company_id', type: 'varchar', length: 255, nullable: true })
  company_id?: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone?: string | null;

  @Column({ name: 'nome', type: 'varchar', length: 40, nullable: true })
  client_name?: string | null;

  @Column({ name: 'service_report', type: 'text', nullable: true })
  service_report?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updated_at?: Date | null;
}
