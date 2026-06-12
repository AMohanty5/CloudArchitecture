import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { camlSchema } from './caml-schema.js';

describe('embedded schema drift guard', () => {
  it('matches schemas/caml-1.0.schema.json exactly (run `pnpm --filter @cac/caml gen` after schema changes)', () => {
    const repoSchemaPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../schemas/caml-1.0.schema.json',
    );
    const repoSchema = JSON.parse(readFileSync(repoSchemaPath, 'utf8'));
    expect(camlSchema).toEqual(repoSchema);
  });
});
