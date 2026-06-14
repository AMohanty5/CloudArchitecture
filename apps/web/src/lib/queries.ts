import { useQueries, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { client } from './client';

export interface ArchitectureSummary {
  id: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  lifecycle: string;
  createdAt: string;
}

/** Create a new architecture (default `main` branch + empty initial commit). */
export async function createArchitecture(name: string): Promise<{ id: string }> {
  const { data, error } = await client.POST('/architectures', { body: { name } });
  if (error || !data) throw new Error('failed to create architecture');
  return data as { id: string };
}

export function useArchitectures(): UseQueryResult<ArchitectureSummary[]> {
  return useQuery({
    queryKey: ['architectures'],
    queryFn: async (): Promise<ArchitectureSummary[]> => {
      const { data, error } = await client.GET('/architectures');
      if (error) throw new Error('failed to load architectures');
      return (data ?? []) as ArchitectureSummary[];
    },
  });
}

export interface ServiceSummary {
  key: string;
  name: string;
  provider: string;
  abstractTypes?: string[];
  groupKind?: string;
  status: string;
  iconUrl: string;
  score: number;
}

export function useCatalogSearch(q: string): UseQueryResult<ServiceSummary[]> {
  return useQuery({
    queryKey: ['catalog', q],
    queryFn: async (): Promise<ServiceSummary[]> => {
      const { data, error } = await client.GET('/catalog/services', { params: { query: { q } } });
      if (error) throw new Error('catalog search failed');
      return (data ?? []) as ServiceSummary[];
    },
  });
}

/** A single property's JSON-Schema fragment (catalog format, doc 14) the form consumes. */
export interface PropertySchema {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'object';
  enum?: unknown[];
  default?: unknown;
  description?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

/** One inbound/outbound connection rule (catalog format, doc 14). `from`/`to` are abstract types. */
export interface ConnectionRule {
  kinds?: string[];
  protocols?: string[];
  from?: string[];
  to?: string[];
}
export interface ConnectionRules {
  inbound?: ConnectionRule[];
  outbound?: ConnectionRule[];
}

/** Full catalog service incl. the property JSON Schema (GET /catalog/services/{key}). */
export interface CatalogServiceDetail {
  key: string;
  name: string;
  provider: string;
  abstractTypes?: string[];
  groupKind?: string;
  properties?: Record<string, PropertySchema>;
  connectionRules?: ConnectionRules;
  iconUrl: string;
}

const serviceQuery = (key: string | undefined) => ({
  queryKey: ['catalog', 'service', key] as const,
  enabled: Boolean(key),
  queryFn: async (): Promise<CatalogServiceDetail> => {
    const { data, error } = await client.GET('/catalog/services/{key}', { params: { path: { key: key! } } });
    if (error || !data) throw new Error('failed to load service');
    return data as CatalogServiceDetail;
  },
});

export function useCatalogService(key: string | undefined): UseQueryResult<CatalogServiceDetail> {
  return useQuery(serviceQuery(key));
}

/**
 * Resolve the catalog service backing a group of the given provider + kind (e.g.
 * aws/network → aws.vpc) and return its detail, so the group inspector can render
 * the same schema-driven property form as components.
 */
export function useGroupService(provider: string | undefined, kind: string | undefined): UseQueryResult<CatalogServiceDetail> {
  const all = useCatalogSearch('');
  const key = all.data?.find((s) => s.groupKind === kind && s.provider === provider)?.key;
  return useQuery(serviceQuery(key));
}

/**
 * Connection rules for the given service keys, keyed by service key (cache-shared with
 * `useCatalogService`). Drives synchronous drag-time connection validation on the canvas.
 */
export function useConnectionRules(serviceKeys: string[]): Map<string, ConnectionRules | undefined> {
  const results = useQueries({ queries: serviceKeys.map((key) => serviceQuery(key)) });
  const map = new Map<string, ConnectionRules | undefined>();
  serviceKeys.forEach((key, i) => map.set(key, results[i]?.data?.connectionRules));
  return map;
}

// ---- History & diff (Day 19) ----

export interface CommitStats {
  components: number;
  connections: number;
  groups: number;
  providers: string[];
}
export interface CommitMeta {
  hash: string;
  parents: string[];
  origin: string;
  message: string;
  stats: CommitStats;
  authorId: string | null;
  createdAt: string;
}

export interface PropertyChange {
  path: string;
  before?: unknown;
  after?: unknown;
}
export interface ModifiedElement {
  id: string;
  changes: PropertyChange[];
}
export interface CollectionDiff<T> {
  added: T[];
  removed: T[];
  modified: ModifiedElement[];
}
export interface ModelDiff {
  components: CollectionDiff<{ id: string; name?: string }>;
  connections: CollectionDiff<{ id: string; from: string; to: string; kind: string }>;
  groups: CollectionDiff<{ id: string; name?: string }>;
  policies: CollectionDiff<{ id: string }>;
  requirements: CollectionDiff<{ id: string }>;
  deployments: CollectionDiff<{ id: string }>;
  document: PropertyChange[];
}
export interface DiffResult {
  from: string;
  to: string;
  summary: string;
  diff: ModelDiff;
}

export function useCommits(id: string): UseQueryResult<CommitMeta[]> {
  return useQuery({
    queryKey: ['commits', id],
    enabled: id.length > 0,
    queryFn: async (): Promise<CommitMeta[]> => {
      const { data, error } = await client.GET('/architectures/{id}/commits', { params: { path: { id } } });
      if (error || !data) throw new Error('failed to load history');
      return (data as { commits: CommitMeta[] }).commits;
    },
  });
}

export function useDiff(id: string, from: string | undefined, to: string | undefined): UseQueryResult<DiffResult> {
  return useQuery({
    queryKey: ['diff', id, from, to],
    enabled: id.length > 0 && Boolean(from) && Boolean(to),
    queryFn: async (): Promise<DiffResult> => {
      const { data, error } = await client.GET('/architectures/{id}/diff', {
        params: { path: { id }, query: { from: from!, to: to! } },
      });
      if (error || !data) throw new Error('failed to load diff');
      return data as DiffResult;
    },
  });
}

/** Fetch a commit's full model (imperative — used by restore). */
export async function fetchCommitModel(id: string, hash: string): Promise<Record<string, unknown>> {
  const { data, error } = await client.GET('/architectures/{id}/commits/{hash}', { params: { path: { id, hash } } });
  if (error || !data) throw new Error('failed to load commit');
  return (data as { model: Record<string, unknown> }).model;
}

/** A commit's full model (the diff view renders the `to` commit). */
export function useCommitModel(id: string, hash: string | undefined): UseQueryResult<Record<string, unknown>> {
  return useQuery({
    queryKey: ['commitModel', id, hash],
    enabled: id.length > 0 && Boolean(hash),
    queryFn: () => fetchCommitModel(id, hash!),
  });
}

export function useModel(id: string, branch = 'main'): UseQueryResult<unknown> {
  return useQuery({
    queryKey: ['model', id, branch],
    enabled: id.length > 0,
    queryFn: async () => {
      const { data, error } = await client.GET('/architectures/{id}/branches/{branch}/model', {
        params: { path: { id, branch } },
      });
      if (error) throw new Error('failed to load model');
      return data;
    },
  });
}
