import { Module } from '@nestjs/common';
import { AppCobrancaController } from './app.controllers';
import { AppService } from './app.services';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/clients';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forFeature([Client]),
    DatabaseModule,
  ],
  controllers: [AppCobrancaController],
  providers: [AppService],
})
export class AppModule {}
