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
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import { TemplateDispatchBatch } from '../templates/entities/template-dispatch-batch.entity';
import { Campaign } from '../campaigns/entities/campanhas.entity';
import { Category } from '../category/entities/category.entity';
import { Overdue } from '../invoices/entities/Overdue';
import { Agent } from '../agents/entities/agent.entity';

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
        Client,
        Service,
        Company,
        Templates,
        RelatoryDispatchTemplate,
        TemplateDispatchBatch,
        Campaign,
        Category,
        Agent,
        Overdue
      ],
      synchronize: true,
    };
  },
};
