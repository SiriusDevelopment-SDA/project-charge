/* eslint-disable prettier/prettier */
/**
 * DataSource standalone do TypeORM para a CLI de migrations.
 *
 * Este arquivo roda FORA do contexto do Nest (a CLI do TypeORM nao instancia
 * o ConfigModule), por isso carregamos o `.env` manualmente via `dotenv/config`
 * e lemos `process.env` diretamente. As variaveis sao EXATAMENTE as mesmas
 * usadas em `database.config.ts` (DB_HOST, DB_PORT, DB_USER_NAME, DB_PASSWORD,
 * DB_DATABASE), de modo que CLI e aplicacao apontam para o mesmo banco.
 *
 * `synchronize` e sempre `false` aqui: a CLI NUNCA deve alterar o schema
 * automaticamente — apenas aplicar/reverter migrations explicitas.
 *
 * --------------------------------------------------------------------------
 * Como rodar (a partir de `backend/`):
 *
 *   npm run migration:show     # read-only: lista o estado das migrations
 *   npm run migration:run      # aplica as migrations pendentes
 *   npm run migration:revert   # reverte a ultima migration aplicada
 *
 * Deploy em PRODUCAO (synchronize: false no app):
 *   1. Garanta as envs DB_* apontando para o banco de producao.
 *   2. Rode `npm run migration:run` ANTES de subir a nova versao da aplicacao.
 *      (ex.: a migration AddNotificameChannelsArray converte
 *       company.canalId_notificameHub de varchar -> jsonb.)
 *   3. So entao faca o deploy do codigo que depende do novo schema.
 * --------------------------------------------------------------------------
 */
import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

import { Client } from '../clients/entities.ts/clients';
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

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER_NAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  // Mesma lista explicita de entities do database.config.ts (alguns arquivos
  // nao seguem o padrao *.entity.ts, ex.: clients/entities.ts/clients.ts), o que
  // torna globs frageis. Importar as classes garante o mesmo conjunto que o app.
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
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  // A CLI nunca deve sincronizar o schema automaticamente.
  synchronize: false,
  migrationsTableName: 'migrations',
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
