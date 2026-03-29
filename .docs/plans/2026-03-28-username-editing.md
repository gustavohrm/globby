# Username Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the username collision gap in `createUser`, add a `changeUsername` backend function, extend the PATCH route to accept a `username` field, and make the username input editable in the settings UI.

**Architecture:** Backend changes are isolated to `modules/users/user.ts` (data logic) and the PATCH route handler (validation + orchestration). The frontend settings script gains username-aware save/error logic. No new files — all changes extend existing ones.

**Tech Stack:** Vanilla TypeScript, Cloudflare Workers + KV, Vitest (backend only)

---

## File Map

| Action | Path                                             | Responsibility                                              |
| ------ | ------------------------------------------------ | ----------------------------------------------------------- |
| Modify | `apps/backend/src/modules/users/user.ts`         | Fix `createUser` retry loop; add `changeUsername`           |
| Create | `apps/backend/src/modules/users/user.test.ts`    | Unit tests for `createUser` uniqueness and `changeUsername` |
| Modify | `apps/backend/src/modules/users/index.ts`        | Re-export `changeUsername`                                  |
| Modify | `apps/backend/src/routes/v1/users/index.ts`      | Accept `username` in PATCH body, call `changeUsername`      |
| Modify | `apps/backend/src/routes/v1/users/index.test.ts` | Route-level tests for username PATCH                        |
| Modify | `apps/frontend/settings/index.ts`                | Remove readonly, include username in save, handle 409       |

---

## Task 1: Fix `createUser` collision retry loop

**Files:**

- Modify: `apps/backend/src/modules/users/user.ts`
- Create: `apps/backend/src/modules/users/user.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/modules/users/user.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- user.test
```

Expected: FAIL — `createUser` imported but the retry loop isn't in place yet; the uniqueness test may also fail intermittently.

- [ ] **Step 3: Replace `createUser` with a retry loop**

In `apps/backend/src/modules/users/user.ts`, replace the `createUser` function (lines 28–52):

```typescript
export async function createUser(kv: KVNamespace): Promise<User> {
  const id = crypto.randomUUID();
  const secret = crypto.randomUUID();

  // Try the plain name first, then up to 9 suffixed attempts
  let username: string | null = null;
  const plain = generateUsername();
  if (!(await kv.get(`username:${plain}`))) {
    username = plain;
  } else {
    for (let i = 0; i < 9; i++) {
      const candidate = generateUsernameWithSuffix();
      if (!(await kv.get(`username:${candidate}`))) {
        username = candidate;
        break;
      }
    }
  }

  if (!username) {
    throw new Error('Could not generate a unique username after 10 attempts');
  }

  const user: User = {
    id,
    username,
    displayName: null,
    secret,
    isPublic: false,
    createdAt: new Date().toISOString(),
  };

  await kv.put(userKey(id), JSON.stringify(user));
  await kv.put(`username:${username}`, id);

  return user;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- user.test
```

Expected: PASS — both `createUser` tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/users/user.ts apps/backend/src/modules/users/user.test.ts
git commit -m "fix: retry username generation up to 10 times on collision"
```

---

## Task 2: Add `changeUsername` function

**Files:**

- Modify: `apps/backend/src/modules/users/user.ts`
- Modify: `apps/backend/src/modules/users/user.test.ts`
- Modify: `apps/backend/src/modules/users/index.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/backend/src/modules/users/user.test.ts`:

```typescript
import { changeUsername } from './user';

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- user.test
```

Expected: FAIL — `changeUsername` is not exported yet.

- [ ] **Step 3: Implement `changeUsername` in `user.ts`**

Add this function at the end of `apps/backend/src/modules/users/user.ts`, after `toPublicProfile`:

```typescript
// NOTE: Cloudflare KV has no atomic compare-and-swap. Two concurrent requests
// claiming the same username can both pass the check below; the last write wins
// on the index, leaving one user's record inconsistent. The risk is low for this
// infrequent operation. Revisit when Durable Objects are introduced.
export async function changeUsername(kv: KVNamespace, user: User, newUsername: string): Promise<User | 'conflict'> {
  if (newUsername === user.username) return user;

  const existing = await kv.get(`username:${newUsername}`);
  if (existing) return 'conflict';

  await kv.delete(`username:${user.username}`);
  await kv.put(`username:${newUsername}`, user.id);

  const updated: User = { ...user, username: newUsername };
  await kv.put(userKey(updated.id), JSON.stringify(updated));

  return updated;
}
```

- [ ] **Step 4: Re-export `changeUsername` from the module barrel**

In `apps/backend/src/modules/users/index.ts`, replace line 2:

```typescript
export { getUser, createUser, updateUser, getLobbyUsers, toPublicProfile, changeUsername } from './user';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test -- user.test
```

Expected: PASS — all `changeUsername` tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/users/user.ts apps/backend/src/modules/users/user.test.ts apps/backend/src/modules/users/index.ts
git commit -m "feat: add changeUsername with KV index swap and conflict detection"
```

---

## Task 3: Extend PATCH route to accept `username`

**Files:**

- Modify: `apps/backend/src/routes/v1/users/index.ts`
- Modify: `apps/backend/src/routes/v1/users/index.test.ts`

- [ ] **Step 1: Write the failing route tests**

Append to the existing `describe('PATCH /api/v1/users/:id', ...)` block in `apps/backend/src/routes/v1/users/index.test.ts`:

```typescript
it('updates username when field is present and valid', async () => {
  const kv = makeMockKV();
  const createRes = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
  const { id, secret } = (await createRes.json()) as { id: string; secret: string };

  const res = await handle(
    new Request(`http://localhost/api/v1/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ username: 'CoolHandle-99' }),
    }),
    makeEnv(kv),
  );

  expect(res.status).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.username).toBe('CoolHandle-99');
});

it('returns 409 when username is already taken', async () => {
  const kv = makeMockKV();
  const resA = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
  const { username: usernameA } = (await resA.json()) as { username: string };

  const resB = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
  const { id: idB, secret: secretB } = (await resB.json()) as { id: string; secret: string };

  const res = await handle(
    new Request(`http://localhost/api/v1/users/${idB}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secretB}` },
      body: JSON.stringify({ username: usernameA }),
    }),
    makeEnv(kv),
  );

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: 'Username already taken' });
});

it('returns 400 for username that is too short', async () => {
  const kv = makeMockKV();
  const createRes = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
  const { id, secret } = (await createRes.json()) as { id: string; secret: string };

  const res = await handle(
    new Request(`http://localhost/api/v1/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ username: 'ab' }),
    }),
    makeEnv(kv),
  );

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'Invalid request body' });
});

it('returns 400 for username with invalid characters', async () => {
  const kv = makeMockKV();
  const createRes = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), makeEnv(kv));
  const { id, secret } = (await createRes.json()) as { id: string; secret: string };

  const res = await handle(
    new Request(`http://localhost/api/v1/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ username: 'bad name!' }),
    }),
    makeEnv(kv),
  );

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'Invalid request body' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- users/index.test
```

Expected: FAIL — route doesn't handle `username` yet.

- [ ] **Step 3: Update the PATCH route handler**

Replace the entire `register<Env>({ method: 'PATCH', ... })` block in `apps/backend/src/routes/v1/users/index.ts`:

```typescript
register<Env>({
  method: 'PATCH',
  path: '/api/v1/users/:id',
  handler: async (req, params, env) => {
    const secret = extractBearer(req);
    if (!secret) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let user = await getUser(env.USERS_KV, params.id);
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    if (user.secret !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { username?: unknown; displayName?: unknown; isPublic?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const USERNAME_RE = /^[a-zA-Z0-9-]{3,32}$/;

    if (
      (body.username !== undefined && (typeof body.username !== 'string' || !USERNAME_RE.test(body.username))) ||
      (body.displayName !== undefined && body.displayName !== null && typeof body.displayName !== 'string') ||
      (body.isPublic !== undefined && typeof body.isPublic !== 'boolean')
    ) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (body.username !== undefined) {
      const result = await changeUsername(env.USERS_KV, user, body.username as string);
      if (result === 'conflict') {
        return Response.json({ error: 'Username already taken' }, { status: 409 });
      }
      user = result;
    }

    const updated = await updateUser(env.USERS_KV, user, {
      displayName: body.displayName !== undefined ? (body.displayName as string | null) : undefined,
      isPublic: body.isPublic !== undefined ? (body.isPublic as boolean) : undefined,
    });

    return Response.json(toPublicProfile(updated));
  },
});
```

- [ ] **Step 4: Update the import to include `changeUsername`**

In `apps/backend/src/routes/v1/users/index.ts`, replace line 2:

```typescript
import {
  createUser,
  getUser,
  updateUser,
  toPublicProfile,
  extractBearer,
  changeUsername,
} from '../../../modules/users';
```

- [ ] **Step 5: Run all backend tests**

```bash
npm run test
```

Expected: PASS — all tests green, including the four new PATCH tests.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/v1/users/index.ts apps/backend/src/routes/v1/users/index.test.ts
git commit -m "feat: accept username in PATCH /api/v1/users/:id with conflict detection"
```

---

## Task 4: Make username editable in settings UI

**Files:**

- Modify: `apps/frontend/settings/index.ts`

- [ ] **Step 1: Remove the `readonly` attribute**

In `apps/frontend/settings/index.ts`, remove this line (currently line 76):

```typescript
document.getElementById('username-input')?.querySelector('input')?.setAttribute('readonly', '');
```

- [ ] **Step 2: Replace the save handler body**

Replace the `saveBtn?.addEventListener('click', ...)` block (lines 90–118) with:

```typescript
const saveBtn = document.getElementById('save-btn');
saveBtn?.addEventListener('click', async () => {
  document.getElementById('save-error')?.remove();
  saveBtn.classList.add('loading');

  const username = getInputValue('username-input');
  const displayName = getInputValue('display-name-input') || null;
  const isPublic = getToggleChecked('public-toggle');

  const patchBody: Record<string, unknown> = { displayName, isPublic };
  if (username !== original.username) {
    patchBody.username = username;
  }

  try {
    const res = await fetch(`/api/v1/users/${session.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.secret}`,
      },
      body: JSON.stringify(patchBody),
    });

    if (res.ok) {
      original = (await res.json()) as UserProfile;
      populateEditable(original);
    } else if (res.status === 409) {
      document
        .querySelector('h1')
        ?.insertAdjacentHTML('afterend', '<p id="save-error" class="text-error">Username already taken.</p>');
    } else {
      document
        .querySelector('h1')
        ?.insertAdjacentHTML('afterend', '<p id="save-error" class="text-error">Save failed. Please try again.</p>');
    }
  } finally {
    saveBtn.classList.remove('loading');
  }
});
```

- [ ] **Step 3: Update `populateEditable` to also populate the username field**

The `populateEditable` function currently only populates `display-name-input` and `public-toggle`. Since `original` is now updated with the saved username on success, add username population so the field reflects the server-confirmed value after save.

Replace the `populateEditable` function (around lines 78–81):

```typescript
function populateEditable(profile: UserProfile) {
  setInputValue('username-input', profile.username);
  setInputValue('display-name-input', profile.displayName ?? '');
  setToggleChecked('public-toggle', profile.isPublic);
}
```

And remove the now-redundant `setInputValue('username-input', original.username)` call on line 75 — `populateEditable(original)` on line 83 will cover it.

- [ ] **Step 4: Verify manually**

Run `npm run preview:local` and open `http://localhost:5173/settings/`.

1. Username field should be populated and editable (no `readonly` attribute).
2. Change the username to a valid value (alphanumeric + hyphens, 3–32 chars) and click **Save** — field should reflect the new username after save.
3. Reload the page — new username should still be shown (fetched from API).
4. Try saving a username already in use (create a second session in a private window to claim a name) — should show "Username already taken." error.
5. Try saving a username with spaces or special characters — should show "Save failed. Please try again." (backend 400).
6. Click **Cancel** after making changes — should revert to the last saved username.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/settings/index.ts
git commit -m "feat: make username editable in settings with conflict and validation feedback"
```
