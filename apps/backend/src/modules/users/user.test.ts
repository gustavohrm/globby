import { describe, it, expect } from 'vitest';
import { createUser, changeUsername } from './user';

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

describe('changeUsername', () => {
  it('returns updated user with new username', async () => {
    const kv = makeMockKV();
    const user = await createUser(kv);
    const result = await changeUsername(kv, user, 'NewHandle-42');
    expect(result).not.toBe('conflict');
    if (result === 'conflict') return;
    expect(result.username).toBe('NewHandle-42');
  });

  it('removes old username index entry', async () => {
    const kv = makeMockKV();
    const user = await createUser(kv);
    const oldUsername = user.username;
    const result = await changeUsername(kv, user, 'BrandNewName');
    expect(result).not.toBe('conflict');
    expect(await kv.get(`username:${oldUsername}`)).toBeNull();
  });

  it('adds new username index entry pointing to user id', async () => {
    const kv = makeMockKV();
    const user = await createUser(kv);
    const result = await changeUsername(kv, user, 'MyNewName');
    expect(result).not.toBe('conflict');
    if (result === 'conflict') return;
    expect(await kv.get('username:MyNewName')).toBe(user.id);
  });

  it('returns conflict when username is already taken', async () => {
    const kv = makeMockKV();
    const userA = await createUser(kv);
    const userB = await createUser(kv);
    const result = await changeUsername(kv, userB, userA.username);
    expect(result).toBe('conflict');
  });

  it('returns user unchanged when new username matches current', async () => {
    const kv = makeMockKV();
    const user = await createUser(kv);
    const result = await changeUsername(kv, user, user.username);
    expect(result).not.toBe('conflict');
    if (result === 'conflict') return;
    expect(result.username).toBe(user.username);
  });
});
