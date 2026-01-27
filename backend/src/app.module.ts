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
import { InvoicesService } from './invoices/services/invoices.service';
import { Company } from './companies/entities/companies';
import { IXCInvoicesService } from './invoices/services/ixcInvoicesService';
import { HubsoftInvoicesService } from './invoices/services/hubsoftInvoicesService';
import { SGPInvoicesService } from './invoices/services/sgpInvoicesService';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forFeature([Client]),
    TypeOrmModule.forFeature([Templates]),
    TypeOrmModule.forFeature([RelatoryDispatchTemplate]),
    TypeOrmModule.forFeature([Invoice]),
    TypeOrmModule.forFeature([Company]),
    DatabaseModule,
  ],
  controllers: [ControllerClients, ControllerTemplates, InvoicesController],
  providers: [AppServiceClient, AppServiceTemplate, InvoicesService, IXCInvoicesService,
    HubsoftInvoicesService,
    SGPInvoicesService],
})
export class AppModule { }
