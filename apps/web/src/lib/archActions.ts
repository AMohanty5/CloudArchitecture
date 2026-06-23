import { apiBase } from './client';

/**
 * Architecture CRUD actions (Hub P1) over the PATCH / DELETE / duplicate endpoints. Raw fetch
 * (matching the layout/validate/connection-rules calls) so no generated-client regen is needed.
 * Callers invalidate the `['architectures']` query after a successful mutation.
 */
async function request<T>(path: string, method: string, body?: unknown): Promise<T | null> {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = `${method} ${path} failed (${res.status})`;
    try {
      const problem = (await res.json()) as { detail?: string; message?: string };
      detail = problem.detail ?? problem.message ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return res.status === 204 ? null : ((await res.json()) as T);
}

export const renameArchitecture = (id: string, name: string): Promise<unknown> =>
  request(`/architectures/${id}`, 'PATCH', { name });

export const setArchitectureLifecycle = (id: string, lifecycle: string): Promise<unknown> =>
  request(`/architectures/${id}`, 'PATCH', { lifecycle });

export const setArchitectureTags = (id: string, tags: string[]): Promise<unknown> =>
  request(`/architectures/${id}`, 'PATCH', { tags });

export const setArchitectureFolder = (id: string, folderId: string | null): Promise<unknown> =>
  request(`/architectures/${id}`, 'PATCH', { folderId });

// ---- Folders (P2) ----
export const createFolder = (name: string): Promise<{ id: string } | null> =>
  request<{ id: string }>(`/folders`, 'POST', { name });

export const renameFolder = (id: string, name: string): Promise<unknown> =>
  request(`/folders/${id}`, 'PATCH', { name });

export const deleteFolder = (id: string): Promise<unknown> => request(`/folders/${id}`, 'DELETE');

export const duplicateArchitecture = (id: string, name: string): Promise<{ id: string } | null> =>
  request<{ id: string }>(`/architectures/${id}/duplicate`, 'POST', { name });

export const deleteArchitecture = (id: string): Promise<unknown> => request(`/architectures/${id}`, 'DELETE');
