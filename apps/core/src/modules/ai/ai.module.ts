import { Module } from '@nestjs/common';
import { ArchitectureModule } from '../architecture/api';
import { AiController } from './ai.controller';
import { GenerationService } from './generation.service';

/**
 * ai — generation pipeline (blueprint doc 07). Activated as a TypeScript module in the
 * core monolith (DECISIONS.md, Day 30) rather than a separate Python service. Imports the
 * Architecture module so the Composer commits generated models through the write path; the
 * catalog (CATALOG) is global. Depend via `./api`.
 */
@Module({
  imports: [ArchitectureModule],
  controllers: [AiController],
  providers: [GenerationService],
})
export class AiModule {}
