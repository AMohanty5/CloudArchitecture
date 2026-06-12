import { Controller, Get } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  service: 'core';
  time: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok', service: 'core', time: new Date().toISOString() };
  }
}
