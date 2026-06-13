import type { CamlDocument } from '@cac/caml';

export interface CommitStats {
  components: number;
  connections: number;
  groups: number;
  providers: string[];
}

/** Cheap commit-time summary stored on each commit (doc 04 `stats`). */
export function computeStats(model: CamlDocument): CommitStats {
  const providers = new Set<string>();
  for (const c of model.components ?? []) if (c.binding?.provider) providers.add(c.binding.provider);
  for (const g of model.groups ?? []) if (g.provider) providers.add(g.provider);
  return {
    components: (model.components ?? []).length,
    connections: (model.connections ?? []).length,
    groups: (model.groups ?? []).length,
    providers: [...providers].sort(),
  };
}
