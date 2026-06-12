import { Module } from '@nestjs/common';

/**
 * Architecture Service — the system of record for CAML commits, branches, and
 * diffs (blueprint doc 03 §3.3). Endpoints (create / commit / read, history /
 * diff) land in Days 8–9. Other modules depend on this only via `./api`.
 */
@Module({})
export class ArchitectureModule {}
