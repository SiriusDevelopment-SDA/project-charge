import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './clients/entities.ts/clients';
import { ControllerClients } from './clients/app.controllers.clients';
import { ControllerTemplates } from './templates/app.controllers.templates';
import { AppServiceClient } from './clients/app.service.clients';
import { AppServiceTemplate } from './templates/app.service.templates';
import { Templates } from './templates/entities/templatesMeta';
import { RelatoryDispatchTemplate } from './templates/entities/relatory.entity';
import { Invoice } from './invoices/entities/invoices';
import { InvoiceSyncState } from './invoices/entities/invoice-sync-state.entity';
import { InvoicesController } from './invoices/controllers/invoicesController';
import { Company } from './companies/entities/companies';
import { IXCInvoicesService } from './invoices/services/ixcInvoicesService';
import { HubsoftInvoicesService } from './invoices/services/hubsoftInvoicesService';
import { SGPInvoicesService } from './invoices/services/sgpInvoicesService';
import { MkInvoicesService } from './invoices/services/mkInvoicesService';
import { Campaign } from './campaigns/entities/campanhas.entity';
import { CampaignsController } from './campaigns/campaigns.controller';
import { CampaignsService } from './campaigns/campaigns.service';
import { Category } from './category/entities/category.entity';
import { CategoryController } from './category/category.controller';
import { CategoryService } from './category/category.service';
import { ControllerServices } from './services/app.controller.services';
import { AppServiceServices } from './services/app.service.services';
import { Service } from './services/entities/services';
import { AppServiceGraphics } from './graphics/app.service.graphics';
import { GraphicsController } from './graphics/app.controller.graphics';
import { TemplateVarsValidator } from './validations';
import { CampaignMetricsGateway } from './realtime/campaigns-metrics.gateway';
import { InvoicesSyncGateway } from './realtime/invoices-sync.gateway';
import { ChatGateway } from './realtime/chat.gateway';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { Agent } from './agents/entities/agent.entity';
import { ChatwootController } from './chatwoot/chatwoot.controller';
import { ChatwootService } from './chatwoot/chatwoot.service';
import { RedisService } from './redis/redis.service';
import { RedisController } from './redis/redis.controller';
import { NotificaMeWebhookController } from './webhooks/notificame.webhook.controller';
import { MaestroWebhookController } from './webhooks/maestro.webhook.controller';
import { RelatoryResolverCron } from './templates/relatory-resolver.cron';
import { TemplateStatusSyncCron } from './templates/template-status-sync.cron';
import { ClientsSyncCron } from './clients/clients-sync.cron';
import { AgentsSyncCron } from './auth/agents-sync.cron';
import { InvoiceSyncCron } from './invoices/invoice-sync.cron';
import { InvoicesService } from './invoices/invoices.service';
import { DispatchBatch } from './message-queue/entities/dispatch-batch.entity';
import { PaymentPromise } from './payment-promise/entities/payment-promise.entity';
import { PaymentPromiseService } from './payment-promise/payment-promise.service';
import { PaymentPromiseController } from './payment-promise/payment-promise.controller';
import { PaymentPromiseCron } from './payment-promise/payment-promise.cron';
import { ClientInteraction } from './client-interaction/entities/client-interaction.entity';
import { ClientInteractionService } from './client-interaction/client-interaction.service';
import { ClientInteractionController } from './client-interaction/client-interaction.controller';
import { ChatSession } from './chatwoot/entities/chat-session.entity';
import { ChatSessionMessage } from './chatwoot/entities/chat-session-message.entity';
import { ChatSessionHistoryService } from './chatwoot/chat-session-history.service';
import { MessageQueueService } from './message-queue/message-queue.service';
import { MessageQueueWorker } from './message-queue/message-queue.worker';
import { TemplateDispatchPayloadService } from './templates/template-dispatch-payload.service';
import { MessageQueue } from './message-queue/entities/message-queue.entity';
import { CampaignScheduler } from './message-queue/campaign-scheduler';
import { CompaniesController } from './companies/companies.controller';
import { CompaniesService } from './companies/companies.service';
import { SuperAdminGuard } from './auth/guards/super-admin.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Client]),
    TypeOrmModule.forFeature([Templates]),
    TypeOrmModule.forFeature([RelatoryDispatchTemplate]),
    TypeOrmModule.forFeature([Invoice]),
    TypeOrmModule.forFeature([InvoiceSyncState]),
    TypeOrmModule.forFeature([Company]),
    TypeOrmModule.forFeature([Campaign]),
    TypeOrmModule.forFeature([Category]),
    TypeOrmModule.forFeature([Service]),
    TypeOrmModule.forFeature([Agent]),
    TypeOrmModule.forFeature([DispatchBatch]),
    TypeOrmModule.forFeature([PaymentPromise]),
    TypeOrmModule.forFeature([ClientInteraction]),
    TypeOrmModule.forFeature([ChatSession]),
    TypeOrmModule.forFeature([ChatSessionMessage]),
    TypeOrmModule.forFeature([MessageQueue]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'coraxy-jwt-secret',
      signOptions: { expiresIn: '12h' },
    }),
    DatabaseModule,
  ],
  controllers: [
    ControllerClients,
    ControllerTemplates,
    InvoicesController,
    CampaignsController,
    CategoryController,
    ControllerServices,
    AuthController,
    ChatwootController,
    RedisController,
    GraphicsController,
    NotificaMeWebhookController,
    MaestroWebhookController,
    PaymentPromiseController,
    ClientInteractionController,
    CompaniesController,

  ],
  providers: [
    AppServiceClient, 
    AppServiceTemplate,
    CampaignsService,
    CategoryService,
    AppServiceServices,
    AppServiceGraphics,
    TemplateVarsValidator,
    CampaignMetricsGateway,
    InvoicesSyncGateway,
    ChatGateway,
    AuthService,
    ChatwootService,
    ChatSessionHistoryService,
    RelatoryResolverCron,
    TemplateStatusSyncCron,
    ClientsSyncCron,
    AgentsSyncCron,
    InvoiceSyncCron,
    InvoicesService,
    PaymentPromiseCron,
    PaymentPromiseService,
    ClientInteractionService,
    MessageQueueService,
    MessageQueueWorker,
    IXCInvoicesService,
    HubsoftInvoicesService,
    SGPInvoicesService,
    MkInvoicesService,
    RedisService,
    TemplateDispatchPayloadService,
    CampaignScheduler,
    CompaniesService,
    SuperAdminGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [
    AppServiceTemplate, 
    AppServiceClient,
    MessageQueueService,
    IXCInvoicesService,
    HubsoftInvoicesService,
    SGPInvoicesService,
    MkInvoicesService,
    TemplateDispatchPayloadService,
    RedisService
  ],
})
export class AppModule { }
