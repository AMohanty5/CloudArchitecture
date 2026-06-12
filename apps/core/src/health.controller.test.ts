import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok with a valid timestamp', () => {
    const result = new HealthController().check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('core');
    expect(Number.isNaN(Date.parse(result.time))).toBe(false);
  });
});
