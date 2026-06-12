import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CamlDocument } from './generated/caml-types.js';
import { indexModel } from './types.js';

const ecommerce = JSON.parse(
  readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../fixtures/valid/02-ecommerce.json',
    ),
    'utf8',
  ),
) as CamlDocument;

describe('indexModel', () => {
  const index = indexModel(ecommerce);

  it('indexes components, groups, and connections by id', () => {
    expect(index.componentsById.get('orders-db')?.name).toBe('Orders Database');
    expect(index.groupsById.get('vpc-main')?.kind).toBe('network');
    expect(index.connectionsById.get('c3')?.kind).toBe('data');
  });

  it('builds group containment buckets', () => {
    expect(index.childrenByGroup.get('vpc-main')?.groups.map((g) => g.id)).toEqual([
      'subnet-public-a',
      'subnet-app-a',
    ]);
    expect(index.childrenByGroup.get('subnet-app-a')?.components.map((c) => c.id)).toEqual([
      'checkout-svc',
      'orders-db',
    ]);
  });

  it('indexes connections by both endpoints', () => {
    const touching = index.connectionsByEndpoint.get('checkout-svc')?.map((c) => c.id);
    expect(touching).toEqual(['c2', 'c3', 'c4']);
  });
});
