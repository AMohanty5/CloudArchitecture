import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Pool } from 'pg';
import { PG_POOL } from './database/database.module';

export interface HealthStatus {
  status: 'ok';
  service: 'core';
  db: 'up' | 'down';
  time: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  @ApiOkResponse({ description: 'Liveness + database reachability.' })
  async check(): Promise<HealthStatus> {
    let db: 'up' | 'down' = 'up';
    try {
      await this.pool.query('SELECT 1');
    } catch {
      db = 'down';
    }
    return { status: 'ok', service: 'core', db, time: new Date().toISOString() };
  }
}
