import { describe, it, expect } from 'vitest';
import { createUser } from './user';

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

describe('createUser', () => {
  it('creates a user with a unique username', async () => {
    const kv = makeMockKV();
    const user = await createUser(kv);
    expect(typeof user.username).toBe('string');
    expect(user.username.length).toBeGreaterThan(0);
  });

  it('creates multiple users all with unique usernames', async () => {
    const kv = makeMockKV();
    const users: Awaited<ReturnType<typeof createUser>>[] = [];
    for (let i = 0; i < 20; i++) {
      users.push(await createUser(kv));
    }
    const usernames = users.map((u) => u.username);
    expect(new Set(usernames).size).toBe(20);
  });
});
