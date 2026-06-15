import type { CamlDocument } from '@cac/caml';
import { renderSvg } from '../diagram/api';
import type { SvgTheme } from '../diagram/api';
import { generateTerraform } from '../iac/api';
import { renderHld } from './hld';

/**
 * The artifact module is the aggregator of derived artifacts (blueprint doc 03):
 * one CAML model fans out to a diagram (SVG), a High-Level Design (markdown), and
 * an IaC bundle (Terraform). `buildArtifacts` composes the three module renderers
 * into a single flat file map — the unit behind both the "download everything"
 * endpoint and the `export` CLI. Pure + deterministic: the whole bundle is a
 * function of the model (+ theme), so identical models export byte-identically.
 */

export interface ExportBundle {
  files: Record<string, string>;
}

export function buildArtifacts(model: CamlDocument, opts: { theme?: SvgTheme } = {}): ExportBundle {
  const files: Record<string, string> = {
    'diagram.svg': renderSvg(model, { theme: opts.theme ?? 'light' }),
    'hld.md': renderHld(model),
  };
  const { files: terraform } = generateTerraform(model);
  for (const [name, content] of Object.entries(terraform)) files[`terraform/${name}`] = content;
  return { files };
}
