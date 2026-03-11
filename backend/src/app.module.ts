import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { InvoicesController } from './invoices/controllers/invoicesController';
import { Company } from './companies/entities/companies';
import { IXCInvoicesService } from './invoices/services/ixcInvoicesService';
import { HubsoftInvoicesService } from './invoices/services/hubsoftInvoicesService';
import { SGPInvoicesService } from './invoices/services/sgpInvoicesService';
import { Campaign } from './campanhas/entities/campanhas.entity';
import { CampaignsController } from './campanhas/campanhas.controller';
import { CampaignsService } from './campanhas/campanhas.service';
import { Category } from './category/entities/category.entity';
import { CategoryController } from './category/category.controller';
import { CategoryService } from './category/category.service';
import { ControllerServices } from './services/app.controller.services';
import { AppServiceServices } from './services/app.service.services';
import { Service } from './services/entities/services';
import { AppServiceGraphics } from './graphics/app.service.graphics';
import { GraphicsController } from './graphics/app.controller.graphics';
import { Overdue } from './invoices/entities/Overdue';
import { TemplateVarsValidator } from './validations';
import { CampaignMetricsGateway } from './realtime/campaigns-metrics.gateway';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { Agent } from './agents/entities/agent.entity';
import { ChatwootController } from './chatwoot/chatwoot.controller';
import { ChatwootService } from './chatwoot/chatwoot.service';
import { RedisService } from './redis/redis.service';
import { RedisController } from './redis/redis.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forFeature([Client]),
    TypeOrmModule.forFeature([Templates]),
    TypeOrmModule.forFeature([RelatoryDispatchTemplate]),
    TypeOrmModule.forFeature([Invoice]),
    TypeOrmModule.forFeature([Company]),
    TypeOrmModule.forFeature([Campaign]),
    TypeOrmModule.forFeature([Category]),
    TypeOrmModule.forFeature([Service]),
    TypeOrmModule.forFeature([Overdue]),
    TypeOrmModule.forFeature([Agent]),
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
    GraphicsController
  ],
  providers: [
    AppServiceClient, 
    AppServiceTemplate, 
    IXCInvoicesService, 
    CampaignsService,
    CategoryService,
    HubsoftInvoicesService,
    SGPInvoicesService,
    AppServiceServices,
    AppServiceGraphics,
    TemplateVarsValidator,
    CampaignMetricsGateway,
    AuthService,
    ChatwootService,
    RedisService,
  ],
  exports: [AppServiceTemplate, AppServiceClient],
})
export class AppModule { }
