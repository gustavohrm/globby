import { describe, it, expect } from 'vitest';
import { handle } from '../../router';
import '../users/index';
import './index';
import type { Env } from '../../../../index';

function makeMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true, cursor: '' };
    },
  } as unknown as KVNamespace;
}

function makeEnv(kv: KVNamespace): Env {
  return { USERS_KV: kv };
}

describe('GET /api/v1/lobby/users', () => {
  it('returns empty array when no public users exist', async () => {
    const kv = makeMockKV();
    const res = await handle(new Request('http://localhost/api/v1/lobby/users'), makeEnv(kv));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [] });
  });

  it('returns public users after one opts in', async () => {
    const kv = makeMockKV();

    const createRes = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
    const { id, secret } = (await createRes.json()) as { id: string; secret: string };

    await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ isPublic: true }),
      }),
      makeEnv(kv),
    );

    const res = await handle(new Request('http://localhost/api/v1/lobby/users'), makeEnv(kv));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Array<{ id: string }> };
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe(id);
    expect(typeof body.users[0].username).toBe('string');
    expect(body.users[0]).not.toHaveProperty('secret');
    expect(body.users[0]).not.toHaveProperty('isPublic');
  });

  it('removes user from lobby when they set isPublic to false', async () => {
    const kv = makeMockKV();

    const createRes = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
    const { id, secret } = (await createRes.json()) as { id: string; secret: string };

    await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ isPublic: true }),
      }),
      makeEnv(kv),
    );

    await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ isPublic: false }),
      }),
      makeEnv(kv),
    );

    const res = await handle(new Request('http://localhost/api/v1/lobby/users'), makeEnv(kv));
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users).toHaveLength(0);
  });
});
