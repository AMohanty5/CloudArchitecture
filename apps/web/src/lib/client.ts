import { makeClient } from '../api';

/** App-wide typed core client. Base is the proxied `/api/v1` (override with VITE_API_BASE). */
const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';
export const client = makeClient(base);
