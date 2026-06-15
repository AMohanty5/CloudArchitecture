import { Module } from '@nestjs/common';
import { ArchitectureController } from './architecture.controller';
import { ArchitectureService } from './architecture.service';
import { ArchitectureRepository } from './architecture.repository';

/**
 * Architecture Service — the system of record for CAML commits, branches, and
 * diffs (blueprint doc 03 §3.3). Create / commit / read land here (Day 8);
 * history + diff (Day 9). Other modules depend on this only via `./api`.
 */
@Module({
  controllers: [ArchitectureController],
  providers: [ArchitectureService, ArchitectureRepository],
  exports: [ArchitectureService], // the AI composer commits generated models through the write path (doc 12 invariant 3)
})
export class ArchitectureModule {}
