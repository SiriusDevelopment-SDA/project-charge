import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/companies';

export type InvoiceSyncStatus = 'idle' | 'running' | 'success' | 'error';

@Entity()
@Unique(['company'])
export class InvoiceSyncState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Company, { nullable: false })
  @JoinColumn({
    name: 'companyId',
    referencedColumnName: 'id',
  })
  company!: Company;

  @Column({ type: 'varchar', default: 'idle' })
  status!: InvoiceSyncStatus;

  @Column({ type: 'timestamp', nullable: true })
  lastStartedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastFinishedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSuccessAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  message?: string | null;

  @Column({ type: 'int', default: 0 })
  invoicesSynced!: number;

  @Column({ type: 'bigint', nullable: true })
  durationMs?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
