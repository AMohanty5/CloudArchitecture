/**
 * Emit a Terraform bundle from a CAML model JSON file. Used to validate the
 * generator's output (`terraform validate`) locally and in CI.
 *
 *   tsx src/modules/iac/emit.cli.ts <model.json> [outDir]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateTerraform } from './terraform';
import type { CamlDocument } from '@cac/caml';

const modelPath = process.argv[2];
const outDir = process.argv[3] ?? 'tf-out';
if (!modelPath) {
  console.error('usage: emit.cli <model.json> [outDir]');
  process.exit(1);
}

const model = JSON.parse(readFileSync(modelPath, 'utf8')) as CamlDocument;
mkdirSync(outDir, { recursive: true });
const { files } = generateTerraform(model);
for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content);
console.log(`wrote ${Object.keys(files).length} file(s) to ${outDir}: ${Object.keys(files).join(', ')}`);
