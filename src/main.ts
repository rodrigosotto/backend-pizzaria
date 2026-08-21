import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyIoAdapter } from './infra/adapters/fastify-io.adapter';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { TransformInterceptor } from './core/interceptors/transform.interceptor';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { buildCorsOptions } from './core/config/cors.config';

type FastifyLogRequest = {
  method: string;
  url: string;
  hostname?: string;
  remoteAddress?: string;
  remotePort?: number;
};

function sanitizeRequestUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, 'http://localhost');
    for (const key of ['hub.verify_token', 'hub_verify_token']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return rawUrl.split('?')[0];
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        serializers: {
          req: (request: FastifyLogRequest) => ({
            method: request.method,
            url: sanitizeRequestUrl(request.url),
            hostname: request.hostname,
            remoteAddress: request.remoteAddress,
            remotePort: request.remotePort,
          }),
        },
      },
    }),
    { rawBody: true },
  );

  // ── Multipart (file uploads) ───────────────────────────────────────────────
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

  // ── WebSocket adapter (Socket.io) ─────────────────────────────────────────
  app.useWebSocketAdapter(new FastifyIoAdapter(app));

  // ── Global prefix ──────────────────────────────────────────────────────────
  // O webhook permanece público por meio do decorator @Public(), mas mantém
  // o mesmo prefixo versionado das demais rotas para evitar divergência entre
  // a URL publicada e a URL cadastrada no painel da Meta.
  app.setGlobalPrefix('api/v1');

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.enableCors(buildCorsOptions());

  // ── Global pipes ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      forbidUnknownValues: true,
    }),
  );

  // ── Global filters & interceptors ──────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // ── Swagger ────────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pizza API')
    .setDescription('Sistema de Gestão de Pizzarias — API v4.0')
    .setVersion('4.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addApiKey(
      { type: 'apiKey', name: 'X-Pizzeria-Id', in: 'header' },
      'pizzeria-context',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`🍕 Pizza API running on http://localhost:${port}/api/v1`);
  console.log(`📖 Swagger docs at http://localhost:${port}/docs`);
  console.log(`🚀 Press CTRL+C to stop the server`);
}

bootstrap();
