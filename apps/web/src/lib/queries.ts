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
