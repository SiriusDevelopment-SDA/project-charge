/* eslint-disable prettier/prettier */
import { ConfigService } from '@nestjs/config';
import {
  TypeOrmModuleAsyncOptions,
  TypeOrmModuleOptions,
} from '@nestjs/typeorm';
import { Client } from '../clients/entities.ts/clients';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { Company } from '../companies/entities/companies';
import { Templates } from '../templates/entities/templatesMeta';
import { Service } from '../services/entities/services';
import { Invoice } from '../invoices/entities/invoices';
import { InvoiceSyncState } from '../invoices/entities/invoice-sync-state.entity';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import { Campaign } from '../campaigns/entities/campanhas.entity';
import { Category } from '../category/entities/category.entity';
import { Agent } from '../agents/entities/agent.entity';
import { MessageQueue } from '../message-queue/entities/message-queue.entity';
import { DispatchBatch } from '../message-queue/entities/dispatch-batch.entity';
import { PaymentPromise } from '../payment-promise/entities/payment-promise.entity';
import { ClientInteraction } from '../client-interaction/entities/client-interaction.entity';
import { ChatSession } from '../chatwoot/entities/chat-session.entity';
import { ChatSessionMessage } from '../chatwoot/entities/chat-session-message.entity';
import { ActivityLog } from '../activity-log/entities/activity-log.entity';

export default <TypeOrmModuleAsyncOptions>{
  inject: [ConfigService],
  useFactory: async (
    configService: ConfigService,
  ): Promise<TypeOrmModuleOptions> => {
    return <PostgresConnectionOptions>{
      type: 'postgres',
      host: configService.get('DB_HOST'),
      port: +configService.get('DB_PORT'),
      username: configService.get('DB_USER_NAME'),
      password: configService.get('DB_PASSWORD'),
      database: configService.get('DB_DATABASE'),
      entities: [
        Invoice,
        InvoiceSyncState,
        Client,
        Service,
        Company,
        Templates,
        RelatoryDispatchTemplate,
        Campaign,
        Category,
        Agent,
        MessageQueue,
        DispatchBatch,
        PaymentPromise,
        ClientInteraction,
        ChatSession,
        ChatSessionMessage,
        ActivityLog,
      ],
      synchronize: configService.get('NODE_ENV') !== 'production',
      migrations: [__dirname + '/migrations/*.{ts,js}'],
      extra: {
        max: 10,
        min: 2,
        idleTimeoutMillis: 30000,
      },
    };
  },
};
