import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/companies';
import { ChatSession } from './chat-session.entity';

@Entity({ name: 'chat_session_message' })
@Index(
  'uq_chat_session_message_company_conversation_message',
  ['companyId', 'externalConversationId', 'externalMessageId'],
  { unique: true },
)
@Index('idx_chat_session_message_conversation_created', ['sessionId', 'externalCreatedAt'])
export class ChatSessionMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatSession, (session) => session.messages, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'session_id' })
  session!: ChatSession | null;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId!: string | null;

  @ManyToOne(() => Company, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'account', type: 'varchar', length: 64 })
  account!: string;

  @Column({ name: 'external_conversation_id', type: 'integer' })
  externalConversationId!: number;

  @Column({ name: 'external_message_id', type: 'integer' })
  externalMessageId!: number;

  @Column({ name: 'content', type: 'text', nullable: true })
  content!: string | null;

  @Column({ name: 'sender_type', type: 'varchar', length: 64, nullable: true })
  senderType!: string | null;

  @Column({ name: 'sender_name', type: 'varchar', length: 255, nullable: true })
  senderName!: string | null;

  @Column({ name: 'message_type', type: 'integer', nullable: true })
  messageType!: number | null;

  @Column({ name: 'is_private', type: 'boolean', default: false })
  isPrivate!: boolean;

  @Column({ name: 'external_created_at', type: 'timestamp', nullable: true })
  externalCreatedAt!: Date | null;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt!: Date | null;

  @Column({ name: 'raw_payload', type: 'jsonb', default: () => "'{}'" })
  rawPayload!: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
