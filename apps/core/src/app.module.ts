import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { ArchitectureModule } from './modules/architecture/api';
import { CatalogModule } from './modules/catalog/api';
import { EventsModule } from './modules/events/api';

/**
 * Modular monolith root (blueprint doc 15). Bounded-context modules live under
 * `modules/` and are imported only via their public `api.ts` (eslint-boundaries).
 * Active now: architecture, catalog, events; the rest are stubbed until their day.
 */
@Module({
  imports: [DatabaseModule, RedisModule, ArchitectureModule, CatalogModule, EventsModule],
  controllers: [HealthController],
})
export class AppModule {}
