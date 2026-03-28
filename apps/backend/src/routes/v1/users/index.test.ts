import { describe, it, expect } from 'vitest';
import { handle } from '../../router';
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

describe('POST /api/v1/users', () => {
  it('creates a user and returns id, username, secret', async () => {
    const kv = makeMockKV();
    const res = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      username: string;
      secret: string;
    };
    expect(typeof body.id).toBe('string');
    expect(typeof body.username).toBe('string');
    expect(typeof body.secret).toBe('string');
  });
});

describe('GET /api/v1/users/:id', () => {
  it('returns public profile for existing user', async () => {
    const kv = makeMockKV();
    const createRes = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
    const { id } = (await createRes.json()) as { id: string };

    const res = await handle(new Request(`http://localhost/api/v1/users/${id}`), makeEnv(kv));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(id);
    expect(body).not.toHaveProperty('secret');
  });

  it('returns 404 for unknown user', async () => {
    const kv = makeMockKV();
    const res = await handle(new Request('http://localhost/api/v1/users/nonexistent'), makeEnv(kv));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'User not found' });
  });
});

describe('PATCH /api/v1/users/:id', () => {
  it('updates displayName and isPublic with correct secret', async () => {
    const kv = makeMockKV();
    const createRes = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
    const { id, secret } = (await createRes.json()) as {
      id: string;
      secret: string;
    };

    const res = await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ displayName: 'Alice', isPublic: true }),
      }),
      makeEnv(kv),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.displayName).toBe('Alice');
    expect(body.isPublic).toBe(true);
    expect(body).not.toHaveProperty('secret');
  });

  it('returns 401 with missing Authorization header', async () => {
    const kv = makeMockKV();
    const createRes = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
    const { id } = (await createRes.json()) as { id: string };

    const res = await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Alice' }),
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 with wrong secret', async () => {
    const kv = makeMockKV();
    const createRes = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
    const { id } = (await createRes.json()) as { id: string };

    const res = await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-secret',
        },
        body: JSON.stringify({ displayName: 'Alice' }),
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 for unknown user', async () => {
    const kv = makeMockKV();
    const res = await handle(
      new Request('http://localhost/api/v1/users/nonexistent', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer any-secret',
        },
        body: JSON.stringify({ displayName: 'Alice' }),
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    const kv = makeMockKV();
    const createRes = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
    const { id, secret } = (await createRes.json()) as {
      id: string;
      secret: string;
    };

    const res = await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: 'not json',
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request body' });
  });
});
