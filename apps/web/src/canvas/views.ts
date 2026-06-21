import type { CamlComponent, CamlConnection, ProjectableModel } from './projector';
import { architectureLayer } from './layers';

/**
 * Architecture views (Day 77, docs/canvas-composition.md §8). Four read-only abstractions
 * generated from one model by a pure `applyView` transform fed into `project()`:
 *  - resource:     everything (the editable default)
 *  - architecture: hide low-level security/observability detail
 *  - network:      only the networking constructs (VPC/subnet + gateways/endpoints/SG/NACL)
 *  - executive:    aggregate to Users → Application → Data Platform
 */
export type ArchView = 'resource' | 'architecture' | 'executive' | 'network';

export const VIEW_LABEL: Record<ArchView, string> = {
  resource: 'Resource',
  architecture: 'Architecture',
  executive: 'Executive',
  network: 'Network',
};

/** Keep only components whose type passes `keep`; prune connections to dropped components. */
function filterComponents(model: ProjectableModel, keep: (type: string) => boolean): ProjectableModel {
  const components = (model.components ?? []).filter((c) => keep(c.type));
  const ids = new Set(components.map((c) => c.id));
  const connections = (model.connections ?? []).filter((cn) => ids.has(cn.from) && ids.has(cn.to));
  return { ...model, components, connections };
}

/** One aggregate node per high-level layer (compute → Application, data → Data Platform…). */
interface Aggregate {
  id: string;
  name: string;
  type: string;
  service?: string;
}
const LAYER_AGGREGATE: Partial<Record<ReturnType<typeof architectureLayer>, Aggregate>> = {
  edge: { id: '__exec-users', name: 'Users / Channels', type: 'external' },
  compute: { id: '__exec-app', name: 'Application', type: 'compute.vm', service: 'aws.ec2' },
  integration: { id: '__exec-int', name: 'Integration', type: 'messaging.queue', service: 'aws.sqs' },
  data: { id: '__exec-data', name: 'Data Platform', type: 'storage.object', service: 'aws.s3' },
};

/** Collapse the model to a handful of layer aggregates with edges between them. */
function executiveModel(model: ProjectableModel): ProjectableModel {
  const compAgg = new Map<string, string>(); // component id → aggregate id
  const present = new Map<string, Aggregate>();
  for (const c of model.components ?? []) {
    const agg = LAYER_AGGREGATE[architectureLayer(c.type)];
    if (!agg) continue;
    compAgg.set(c.id, agg.id);
    present.set(agg.id, agg);
  }
  const components: CamlComponent[] = [...present.values()].map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    ...(a.service ? { binding: { provider: 'aws', service: a.service } } : {}),
  }));

  const seen = new Set<string>();
  const connections: CamlConnection[] = [];
  for (const cn of model.connections ?? []) {
    const from = compAgg.get(cn.from);
    const to = compAgg.get(cn.to);
    if (!from || !to || from === to) continue;
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = to === '__exec-data' ? 'data' : 'traffic';
    connections.push({ id: `__exec-${from}-${to}`, from, to, kind });
  }
  return { components, connections }; // no groups — executive hides infra
}

/** Apply a view to a model (pure). Non-resource views are display-only abstractions. */
export function applyView(model: ProjectableModel, view: ArchView): ProjectableModel {
  switch (view) {
    case 'resource':
      return model;
    case 'architecture':
      return filterComponents(model, (t) => {
        const l = architectureLayer(t);
        return l !== 'security' && l !== 'observability';
      });
    case 'network':
      return filterComponents(model, (t) => {
        const l = architectureLayer(t);
        return l === 'network' || l === 'edge' || l === 'security'; // networking + SG/NACL
      });
    case 'executive':
      return executiveModel(model);
  }
}
