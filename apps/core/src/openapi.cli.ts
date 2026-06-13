import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Emit the OpenAPI spec from the NestJS decorators to packages/api-client.
 * Paths are the bare controller routes; the `/api/v1` prefix is the server base
 * (the client is constructed with it), so generated paths stay clean.
 *   pnpm --filter @cac/core openapi
 */
async function main(): Promise<void> {
  process.env.CAC_SKIP_PUBLISH = '1'; // wire the app for scanning only — no DB/Redis
  const app = await NestFactory.create(AppModule, { logger: ['error'], abortOnError: false });
  const config = new DocumentBuilder()
    .setTitle('CloudArchitect Core API')
    .setDescription('System of record for CAML architectures (blueprint doc 03).')
    .setVersion('0.0.1')
    .addServer('/api/v1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const out = path.resolve(process.cwd(), '../../packages/api-client/openapi.json');
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`wrote ${out}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
