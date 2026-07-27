import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { useContainer } from 'class-validator';
import basicAuth from 'express-basic-auth';
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

  // A documentacao expoe a superficie inteira da API: toda rota, todo payload,
  // todo nome de campo. Em producao isso fica atras de basic auth.
  //
  // Os TRES caminhos precisam ser cobertos: `app.use('/api/docs')` casa por
  // segmento de path, entao protegeria `/api/docs` e `/api/docs/algo`, mas NAO
  // `/api/docs-json` — que serve o spec OpenAPI inteiro, o mesmo vazamento.
  //
  // O middleware tem que vir ANTES do `setup`, senao as rotas do Swagger sao
  // registradas primeiro e respondem sem passar por ele.
  const isProd = process.env.NODE_ENV === 'production';
  const swaggerUser = configService.get<string>('SWAGGER_USER');
  const swaggerPassword = configService.get<string>('SWAGGER_PASSWORD');

  if (!isProd) {
    // Ambiente local: sem atrito.
    SwaggerModule.setup('api/docs', app, document);
  } else if (swaggerUser && swaggerPassword) {
    app.use(
      ['/api/docs', '/api/docs-json', '/api/docs-yaml'],
      basicAuth({
        challenge: true,
        users: { [swaggerUser]: swaggerPassword },
      }),
    );
    SwaggerModule.setup('api/docs', app, document);
  } else {
    // Falha fechada: sem credencial configurada a doc simplesmente nao sobe, em
    // vez de subir aberta ou com senha padrao. Se alguem esquecer de definir as
    // variaveis, o sintoma e a doc sumir — que se percebe — e nao ela ficar
    // exposta na internet, que nao se percebe.
    console.warn(
      '[Swagger] Documentacao desabilitada: defina SWAGGER_USER e SWAGGER_PASSWORD para publica-la em producao.',
    );
  }


  await app.listen(configService.get('PORT') || 3000, "0.0.0.0");
  console.log(`Server is running on ${await app.getUrl()}`);
}
bootstrap();