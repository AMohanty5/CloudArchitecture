import { Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { loadConfig } from '../config/config';

/** DI token for the shared Redis client. */
export const REDIS = Symbol('REDIS');

/**
 * Provides the Redis client app-wide (palette cache, and later authz/presence/
 * queues — doc 04 keyspace plan). Connection errors are logged, not thrown, so a
 * transient Redis outage degrades gracefully (callers fall back to Postgres).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (): Redis => {
        const logger = new Logger('redis');
        const client = new Redis(loadConfig().redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false });
        client.on('error', (err: Error) => logger.warn(`redis: ${err.message}`));
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
