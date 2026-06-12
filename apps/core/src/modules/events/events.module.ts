import { Module } from '@nestjs/common';

/**
 * Events — the transactional outbox + publisher (SQS at MVP, doc 03/11). Domain
 * events (`architecture.commit.created`, …) are written in the same tx as the
 * state change and relayed here. Wiring lands with the write path (Day 8+).
 * Depend on this only via `./api`.
 */
@Module({})
export class EventsModule {}
