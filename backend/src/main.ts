import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  app.enableCors({
    origin: configService.get<string>('NODE_ENV') === 'production'
      ? ['https://cobranca.coraxy.com.br']
      : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ],
  });
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true, // ⚠️ ESSENCIAL
    }),
  );
  
  const config = new DocumentBuilder()
  .setTitle('API Project Charge')
  .setDescription('Documentação das rotas do sistema de cobrança - by Anderson Rodrigues')
  .setVersion('1.0')
  .setContact(
    'Anderson Rodrigues',
    '',
    'andersoncassio2008@gmail.com',
  )
  .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  
  await app.listen(configService.get('PORT') || 3000, "0.0.0.0");
  console.log(`Server is running on ${await app.getUrl()}`);
}
bootstrap();