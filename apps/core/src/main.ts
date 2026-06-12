import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Pool } from 'pg';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { PG_POOL } from './database/database.module';
import { runMigrations } from './database/migrate';
import { requestLogger } from './common/request-logger';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger('bootstrap');
  const app = await NestFactory.create(AppModule);

  app.use(requestLogger);

  // Apply pending migrations on boot (idempotent; doc 04 expand-and-contract).
  const pool = app.get<Pool>(PG_POOL);
  const ran = await runMigrations(pool);
  logger.log(ran.length ? `applied migrations: ${ran.join(', ')}` : 'migrations up to date');

  const openApi = new DocumentBuilder()
    .setTitle('CloudArchitect Core API')
    .setDescription('System of record for CAML architectures (blueprint doc 03).')
    .setVersion('0.0.1')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openApi));

  await app.listen(config.port);
  logger.log(`core listening on http://localhost:${config.port} (Swagger at /docs)`);
}

void bootstrap();
