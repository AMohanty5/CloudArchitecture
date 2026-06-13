import createClient from 'openapi-fetch';
import type { Client } from 'openapi-fetch';
import type { paths } from './generated/schema.js';

export type { paths } from './generated/schema.js';

/**
 * Typed client for the core API, generated from the NestJS OpenAPI spec — the
 * frontend never hand-writes fetch calls. Pass the full base URL **including the
 * version prefix**, e.g. `createCoreClient('http://localhost:3001/api/v1')`.
 */
export function createCoreClient(baseUrl: string): Client<paths> {
  return createClient<paths>({ baseUrl });
}

export type CoreClient = Client<paths>;
