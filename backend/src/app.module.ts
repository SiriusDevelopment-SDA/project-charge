import { Module } from '@nestjs/common';
import { AppCobrancaController } from './app.controllers';
import { AppService } from './app.services';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule
  ],
  controllers: [AppCobrancaController],
  providers: [AppService],
})
export class AppModule {}
