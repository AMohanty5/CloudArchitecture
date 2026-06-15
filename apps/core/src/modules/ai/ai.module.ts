import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { GenerationService } from './generation.service';

/**
 * ai — generation pipeline (blueprint doc 07). Activated as a TypeScript module in the
 * core monolith (DECISIONS.md, Day 30) rather than a separate Python service. Generation
 * is stubbed on Day 30; the real agents land on later days. Depend via `./api`.
 */
@Module({
  controllers: [AiController],
  providers: [GenerationService],
})
export class AiModule {}
