import { useQuery } from '@tanstack/react-query';
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
