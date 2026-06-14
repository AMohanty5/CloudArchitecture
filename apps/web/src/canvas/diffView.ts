import type { CamlComponent, CamlConnection, CamlGroup, ProjectableModel } from './projector';
import type { ModelDiff } from '../lib/queries';

export type DiffStatus = 'added' | 'removed' | 'modified';

export interface DiffView {
  /** The `to` model plus removed elements re-injected as ghosts, so every change renders. */
  model: ProjectableModel;
  /** Element/connection id → its change status (drives canvas highlighting). */
  status: Record<string, DiffStatus>;
}

/**
 * Build a renderable diff overlay (blueprint doc 06 derivation): the newer (`to`) model
 * shows added (green) + modified (amber) in place, and removed (red) elements from the
 * `from` side are injected back as ghosts so the whole change set is visible at once.
 * Pure + deterministic.
 */
export function buildDiffView(toModel: ProjectableModel, diff: ModelDiff): DiffView {
  const status: Record<string, DiffStatus> = {};

  for (const c of diff.components.added) status[c.id] = 'added';
  for (const g of diff.groups.added) status[g.id] = 'added';
  for (const c of diff.connections.added) status[c.id] = 'added';
  for (const m of diff.components.modified) status[m.id] = 'modified';
  for (const m of diff.groups.modified) status[m.id] = 'modified';
  for (const m of diff.connections.modified) status[m.id] = 'modified';
  for (const c of diff.components.removed) status[c.id] = 'removed';
  for (const g of diff.groups.removed) status[g.id] = 'removed';
  for (const c of diff.connections.removed) status[c.id] = 'removed';

  return {
    model: {
      components: [...(toModel.components ?? []), ...(diff.components.removed as unknown as CamlComponent[])],
      groups: [...(toModel.groups ?? []), ...(diff.groups.removed as unknown as CamlGroup[])],
      connections: [...(toModel.connections ?? []), ...(diff.connections.removed as unknown as CamlConnection[])],
    },
    status,
  };
}

/** Border/stroke colour per diff status (green/red/amber, blueprint doc 06). */
export const DIFF_COLOR: Record<DiffStatus, string> = {
  added: '#16a34a',
  removed: '#dc2626',
  modified: '#d97706',
};
