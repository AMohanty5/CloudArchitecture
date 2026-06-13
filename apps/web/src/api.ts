import { createCoreClient } from '@cac/api-client';
import type { CoreClient } from '@cac/api-client';

/** The frontend's typed core-API client (no hand-written fetch calls). */
export function makeClient(baseUrl = '/api/v1'): CoreClient {
  return createCoreClient(baseUrl);
}

/** Resolve a branch's head model through the typed client. */
export async function fetchModel(client: CoreClient, id: string, branch = 'main'): Promise<unknown> {
  const { data, error } = await client.GET('/architectures/{id}/branches/{branch}/model', {
    params: { path: { id, branch } },
  });
  if (error) throw new Error(`failed to fetch model for ${id}@${branch}`);
  return data;
}
