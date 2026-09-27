import { describe, expect, it } from 'vitest';
import { fetchApi } from '../src/api/client';

describe('api client', () => {
  it('throws useful errors on failure', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'not here' }),
    })) as unknown as typeof fetch;
    try {
      await expect(fetchApi('/nope')).rejects.toThrow('not here');
    } finally {
      globalThis.fetch = orig;
    }
  });
});
