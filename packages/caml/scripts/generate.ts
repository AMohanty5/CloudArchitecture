/**
 * Codegen for @cac/caml. Source of truth: /schemas/caml-1.0.schema.json.
 * Produces (both committed):
 *   src/schema/caml-schema.ts    — schema embedded as a TS module (avoids JSON-import
 *                                  interop differences between Node ESM and vitest)
 *   src/generated/caml-types.ts  — TypeScript types via json-schema-to-typescript
 * A drift test asserts the embedded schema equals the repo schema.
 */
import { compile } from 'json-schema-to-typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(pkgRoot, '../../schemas/caml-1.0.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

const banner = `/* AUTO-GENERATED from schemas/caml-1.0.schema.json — do not edit by hand.
 * Regenerate with: pnpm --filter @cac/caml gen
 */`;

// 1) Embedded schema module
const schemaOut = resolve(pkgRoot, 'src/schema/caml-schema.ts');
mkdirSync(dirname(schemaOut), { recursive: true });
writeFileSync(
  schemaOut,
  `${banner}\nexport const camlSchema = ${JSON.stringify(schema, null, 2)} as Record<string, unknown>;\n`,
);

// 2) Types. Drop title and $id so the root type is named CamlDocument (both
//    take naming precedence over the compile() name argument).
const clone = structuredClone(schema);
delete clone.title;
delete clone.$id;
const ts = await compile(clone, 'CamlDocument', { bannerComment: banner });
const typesOut = resolve(pkgRoot, 'src/generated/caml-types.ts');
mkdirSync(dirname(typesOut), { recursive: true });
writeFileSync(typesOut, ts);

console.log(`generated:\n  ${schemaOut}\n  ${typesOut}`);
