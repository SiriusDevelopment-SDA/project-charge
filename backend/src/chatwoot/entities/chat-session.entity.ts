import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/companies';
import { ChatSessionMessage } from './chat-session-message.entity';

@Entity({ name: 'chat_session' })
@Index('uq_chat_session_company_conversation', ['companyId', 'externalConversationId'], {
  unique: true,
})
@Index('idx_chat_session_company_status_updated', ['companyId', 'status', 'lastExternalUpdatedAt'])
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Company, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'account', type: 'varchar', length: 64 })
  account!: string;

  @Column({ name: 'external_conversation_id', type: 'integer' })
  externalConversationId!: number;

  @Column({ name: 'external_contact_id', type: 'integer', nullable: true })
  externalContactId!: number | null;

  @Column({ name: 'external_inbox_id', type: 'integer', nullable: true })
  externalInboxId!: number | null;

  @Column({ name: 'external_assignee_id', type: 'integer', nullable: true })
  externalAssigneeId!: number | null;

  @Column({ name: 'external_team_id', type: 'integer', nullable: true })
  externalTeamId!: number | null;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'open' })
  status!: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 255, nullable: true })
  contactName!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 64, nullable: true })
  phone!: string | null;

  @Column({ name: 'normalized_phone', type: 'varchar', length: 64, nullable: true })
  normalizedPhone!: string | null;

  @Column({ name: 'contact_identifier', type: 'varchar', length: 255, nullable: true })
  contactIdentifier!: string | null;

  @Column({ name: 'inbox_identifier', type: 'varchar', length: 255, nullable: true })
  inboxIdentifier!: string | null;

  @Column({ name: 'assignee_name', type: 'varchar', length: 255, nullable: true })
  assigneeName!: string | null;

  @Column({ name: 'team_name', type: 'varchar', length: 255, nullable: true })
  teamName!: string | null;

  @Column({ name: 'labels', type: 'jsonb', default: () => "'[]'" })
  labels!: string[];

  @Column({ name: 'last_message', type: 'text', nullable: true })
  lastMessage!: string | null;

  @Column({ name: 'protocol', type: 'varchar', length: 255, nullable: true })
  protocol!: string | null;

  @Column({ name: 'generated_protocol', type: 'boolean', default: false })
  generatedProtocol!: boolean;

  @Column({ name: 'report', type: 'text', nullable: true })
  report!: string | null;

  @Column({ name: 'unread_count', type: 'integer', default: 0 })
  unreadCount!: number;

  @Column({ name: 'last_external_updated_at', type: 'timestamp', nullable: true })
  lastExternalUpdatedAt!: Date | null;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt!: Date | null;

  @Column({ name: 'raw_payload', type: 'jsonb', default: () => "'{}'" })
  rawPayload!: Record<string, any>;

  @OneToMany(() => ChatSessionMessage, (message) => message.session)
  messages!: ChatSessionMessage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
