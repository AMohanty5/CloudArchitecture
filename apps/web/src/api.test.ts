import { describe, expect, it, vi } from 'vitest';
import { fetchModel, makeClient } from './api';

describe('typed core client (web)', () => {
  it('fetches a model through the generated client', async () => {
    const model = { camlVersion: '1.0', id: 'arch_WEBCLIENT0', name: 'From client', components: [] };
    const fetchMock = vi.fn(
      async (_req: Request) =>
        new Response(JSON.stringify(model), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient('http://localhost:3001/api/v1');
    const result = await fetchModel(client, 'abc123');

    expect(result).toEqual(model);
    expect(fetchMock).toHaveBeenCalledOnce();
    // openapi-fetch dispatches a Request object, not a URL string.
    expect(fetchMock.mock.calls[0]![0].url).toBe(
      'http://localhost:3001/api/v1/architectures/abc123/branches/main/model',
    );
  });
});
