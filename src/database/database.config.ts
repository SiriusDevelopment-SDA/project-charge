/* eslint-disable prettier/prettier */
import { ConfigService } from '@nestjs/config';
import {
  TypeOrmModuleAsyncOptions,
  TypeOrmModuleOptions,
} from '@nestjs/typeorm';
import { Client } from '../entities/clients';
import { Invoice } from '../entities/invoices';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { Service } from '../entities/services';
import { Company } from '../entities/companies';
import { Templates } from '../entities/templatesMeta';

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
      entities: [Invoice, Client, Service, Company, Templates],
      synchronize: true,
    };
  },
};
