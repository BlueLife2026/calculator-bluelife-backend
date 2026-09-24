import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ponytail: sin FRONTEND_URL refleja cualquier origen (comportamiento previo).
  // En produccion la variable es obligatoria.
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BlueLife CRM API')
    .setDescription(
      'API de BlueLife para propiedades, químicos, Health Department y Reports. Los endpoints protegidos reciben Authorization: Bearer <token>.',
    )
    .setVersion('1.0')
    .addServer('https://calculator-bluelife-backend.vercel.app', 'Production')
    .addServer('http://localhost:3000', 'Local development')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'token' },
      'bearer',
    )
    .addTag('System', 'Estado general del backend')
    .addTag(
      'Properties',
      'Propiedades, contactos, piscinas y actividad comercial',
    )
    .addTag('Chemicals', 'Técnicos y reportes de químicos')
    .addTag('Health Department', 'Tickets, comentarios e inspecciones')
    .addTag('Reports', 'Novedades, responsables, archivos y configuración')
    .build();
  const swaggerDocument = () =>
    SwaggerModule.createDocument(app, swaggerConfig, {
      operationIdFactory: (controllerKey, methodKey) =>
        `${controllerKey}_${methodKey}`,
    });
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: 'BlueLife CRM API',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
