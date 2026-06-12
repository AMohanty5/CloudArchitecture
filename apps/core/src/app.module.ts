import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Modular monolith root (blueprint doc 15). Bounded-context modules land here:
 * architecture (Day 7-9), catalog (Day 10), events, identity, workspace, ...
 * Module boundary rule: modules import each other only via their public api.ts.
 */
@Module({
  controllers: [HealthController],
})
export class AppModule {}
