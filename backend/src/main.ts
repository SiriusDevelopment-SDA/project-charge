import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { useContainer } from 'class-validator';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['warn', 'error']
        : ['log', 'warn', 'error', 'verbose'],
  });
  const configService = app.get(ConfigService);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  app.use(require('compression')());
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));
  app.enableCors();
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
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