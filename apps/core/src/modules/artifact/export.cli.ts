/**
 * Emit the full artifact bundle (SVG + HLD + Terraform) for a CAML model file —
 * the local/CI smoke for the export pipeline, and the seed of a future
 * `cac export` CLI (roadmap doc 12, Phase 3).
 *
 *   tsx src/modules/artifact/export.cli.ts <model.json> [outDir]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildArtifacts } from './export';
import type { CamlDocument } from '@cac/caml';

const modelPath = process.argv[2];
const outDir = process.argv[3] ?? 'export-out';
if (!modelPath) {
  console.error('usage: export.cli <model.json> [outDir]');
  process.exit(1);
}

const model = JSON.parse(readFileSync(modelPath, 'utf8')) as CamlDocument;
const { files } = buildArtifacts(model);
for (const [name, content] of Object.entries(files)) {
  const dest = join(outDir, name);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}
console.log(`wrote ${Object.keys(files).length} artifact file(s) to ${outDir}: ${Object.keys(files).join(', ')}`);
