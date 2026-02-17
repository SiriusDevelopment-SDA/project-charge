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
    DatabaseModule,
  ],
  controllers: [ControllerClients, ControllerTemplates, InvoicesController, CampaignsController, CategoryController],
  providers: [
    AppServiceClient, 
    AppServiceTemplate, 
    IXCInvoicesService, 
    CampaignsService,
    CategoryService,
    HubsoftInvoicesService,
    SGPInvoicesService
  ],
})
export class AppModule { }
