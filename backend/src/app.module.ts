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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forFeature([Client]),
    TypeOrmModule.forFeature([Templates]),
    TypeOrmModule.forFeature([RelatoryDispatchTemplate]),
    DatabaseModule,
  ],
  controllers: [ControllerClients, ControllerTemplates],
  providers: [AppServiceClient, AppServiceTemplate],
})
export class AppModule {}
