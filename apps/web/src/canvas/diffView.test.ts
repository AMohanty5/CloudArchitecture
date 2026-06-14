import { describe, expect, it } from 'vitest';
import { buildDiffView } from './diffView';
import type { ModelDiff } from '../lib/queries';
import type { ProjectableModel } from './projector';

const empty = <T>(): { added: T[]; removed: T[]; modified: { id: string; changes: [] }[] } => ({ added: [], removed: [], modified: [] });

const toModel: ProjectableModel = {
  components: [
    { id: 'web', type: 'compute.vm.autoscaling_group', name: 'Web' }, // added
    { id: 'db', type: 'database.relational', name: 'DB' }, // modified
  ],
  connections: [{ id: 'c1', from: 'web', to: 'db', kind: 'data' }],
  groups: [],
};

const diff: ModelDiff = {
  components: {
    added: [{ id: 'web', name: 'Web' }],
    removed: [{ id: 'cache', name: 'Cache' }],
    modified: [{ id: 'db', changes: [{ path: 'properties.multiAz', before: false, after: true }] }],
  },
  connections: empty(),
  groups: empty(),
  policies: empty(),
  requirements: empty(),
  deployments: empty(),
  document: [],
};

describe('buildDiffView', () => {
  it('marks added/modified in place and injects removed elements as ghosts', () => {
    const view = buildDiffView(toModel, diff);
    expect(view.status).toEqual({ web: 'added', db: 'modified', cache: 'removed' });
    // the removed component is re-injected so it renders
    expect(view.model.components!.map((c) => c.id).sort()).toEqual(['cache', 'db', 'web']);
    // unchanged elements stay present and unmarked
    expect(view.status['c1']).toBeUndefined();
    expect(view.model.connections!).toHaveLength(1);
  });
});
