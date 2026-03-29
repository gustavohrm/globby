# Store & Alert Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the new `store` module and `alert` system into the app by extracting a session service and replacing all inline DOM feedback with `showAlert` calls.

**Architecture:** A new `_core/services/session/` service owns the session persistence workflow using `createStore`, eliminating duplication across both pages. The settings page drops all inline DOM error injection in favour of `showAlert`. The home page stays unchanged except for importing from the service.

**Tech Stack:** TypeScript, Vite, Vitest + jsdom, Tailwind CSS v4

---

## File Map

| Status      | Path                                                 | Change                                     |
| ----------- | ---------------------------------------------------- | ------------------------------------------ |
| new         | `apps/frontend/_core/services/session/index.ts`      | Session service                            |
| new         | `apps/frontend/_core/services/session/index.test.ts` | Session service tests                      |
| modify      | `apps/frontend/_core/modules/store/index.test.ts`    | Fix jsdom directive position               |
| modify      | `apps/frontend/index.ts`                             | Use session service, remove duplicate code |
| modify      | `apps/frontend/settings/index.ts`                    | Use session service + `showAlert`          |
| commit only | `apps/frontend/_core/modules/store/index.ts`         | Already implemented                        |
| commit only | `apps/frontend/_core/modules/store/index.test.ts`    | Already implemented                        |
| commit only | `apps/frontend/_ui/scripts/alert/**`                 | Already implemented                        |

---

## Task 1: Commit existing store and alert modules

The store and alert modules were already implemented but not yet committed.

**Files:**

- Commit: `apps/frontend/_core/` (all files)
- Commit: `apps/frontend/_ui/scripts/alert/` (all files)

- [ ] **Step 1: Stage and commit**

```bash
git add apps/frontend/_core/ apps/frontend/_ui/scripts/alert/
git commit -m "feat: add store module and alert system"
```

---

## Task 2: Install jsdom and fix store test

The store test uses `// @vitest-environment jsdom` but the `jsdom` package is not installed, and the directive is placed after imports where Vitest won't read it.

**Files:**

- Modify: `apps/frontend/_core/modules/store/index.test.ts`

- [ ] **Step 1: Install jsdom**

```bash
npm install -D jsdom
```

- [ ] **Step 2: Move the jsdom directive to line 1**

Current file (`index.test.ts`):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from './index';

// @vitest-environment jsdom
```

Replace with:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from './index';
```

- [ ] **Step 3: Run the store tests and verify they pass**

```bash
npm run test
```

Expected: the store test suite passes.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/_core/modules/store/index.test.ts package.json package-lock.json
git commit -m "fix: move jsdom directive to line 1 in store test, install jsdom"
```

---

## Task 3: Create session service (TDD)

Create `_core/services/session/` with the session persistence workflow.

**Files:**

- Create: `apps/frontend/_core/services/session/index.test.ts`
- Create: `apps/frontend/_core/services/session/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/_core/services/session/index.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getOrCreateSession } from './index';

describe('getOrCreateSession', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns stored session without fetching when id and secret are present', async () => {
    localStorage.setItem('globby_session', JSON.stringify({ id: 'stored-id', secret: 'stored-secret' }));
    const fetchSpy = vi.spyOn(global, 'fetch');

    const session = await getOrCreateSession();

    expect(session).toEqual({ id: 'stored-id', secret: 'stored-secret' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs to /api/v1/users and persists the result when storage is empty', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => ({ id: 'new-id', username: 'cool-user', secret: 'new-secret' }),
    } as Response);

    const session = await getOrCreateSession();

    expect(session).toEqual({ id: 'new-id', secret: 'new-secret' });
    expect(JSON.parse(localStorage.getItem('globby_session')!)).toEqual({
      id: 'new-id',
      secret: 'new-secret',
    });
  });

  it('POSTs to /api/v1/users when stored session is missing id', async () => {
    localStorage.setItem('globby_session', JSON.stringify({ id: '', secret: 'orphan' }));
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => ({ id: 'fresh-id', username: 'user', secret: 'fresh-secret' }),
    } as Response);

    const session = await getOrCreateSession();

    expect(session).toEqual({ id: 'fresh-id', secret: 'fresh-secret' });
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm run test
```

Expected: 3 failures with "Cannot find module './index'".

- [ ] **Step 3: Implement the session service**

Create `apps/frontend/_core/services/session/index.ts`:

```ts
import { createStore } from '../../modules/store';

export interface Session {
  id: string;
  secret: string;
}

const store = createStore<Session>('globby_session', { id: '', secret: '' });

export async function getOrCreateSession(): Promise<Session> {
  const stored = store.get();
  if (stored.id && stored.secret) return stored;

  const res = await fetch('/api/v1/users', { method: 'POST' });
  const data = (await res.json()) as { id: string; username: string; secret: string };
  const session: Session = { id: data.id, secret: data.secret };
  store.set(session);
  return session;
}
```

- [ ] **Step 4: Run tests and verify all pass**

```bash
npm run test
```

Expected: all tests pass including the 3 new session service tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/_core/services/
git commit -m "feat: add session service using store module"
```

---

## Task 4: Update home page to use session service

Remove the duplicated session code from `apps/frontend/index.ts` and import from the service.

**Files:**

- Modify: `apps/frontend/index.ts`

- [ ] **Step 1: Replace the file content**

Replace `apps/frontend/index.ts` with:

```ts
import { getOrCreateSession } from './_core/services/session';

interface LobbyUser {
  id: string;
  username: string;
  displayName: string | null;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function avatarText(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

function renderLobby(users: LobbyUser[]): string {
  if (users.length === 0) {
    return '<p class="text-text-secondary">No one in the lobby yet.</p>';
  }
  const rows = users
    .map(
      (u) => `
      <li class="flex items-center gap-3 rounded-lg bg-foreground p-3">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-contrast">
          ${escapeHtml(avatarText(u.username))}
        </div>
        <div>
          <div class="font-medium">${escapeHtml(u.username)}</div>
          ${u.displayName ? `<div class="text-sm text-text-secondary">${escapeHtml(u.displayName)}</div>` : ''}
        </div>
      </li>`,
    )
    .join('');
  return `<ul class="flex flex-col gap-2">${rows}</ul>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  await getOrCreateSession();

  const lobbyEl = document.getElementById('lobby');
  if (!lobbyEl) return;

  try {
    const res = await fetch('/api/v1/lobby/users');
    if (!res.ok) throw new Error(`Lobby fetch failed: ${res.status}`);
    const { users } = (await res.json()) as { users: LobbyUser[] };
    lobbyEl.innerHTML = renderLobby(users);
  } catch {
    lobbyEl.textContent = 'Failed to load lobby.';
  }
});

export {};
```

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: all tests still pass.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/index.ts
git commit -m "refactor: use session service in home page"
```

---

## Task 5: Update settings page — use session service and showAlert

Remove duplicated session code and replace all inline DOM feedback with `showAlert`.

**Files:**

- Modify: `apps/frontend/settings/index.ts`

- [ ] **Step 1: Replace the file content**

Replace `apps/frontend/settings/index.ts` with:

```ts
import { getOrCreateSession, type Session } from '../_core/services/session';
import { showAlert } from '../_ui/scripts/alert';

interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  isPublic: boolean;
}

function getInputValue(id: string): string {
  const el = document.getElementById(id);
  return el?.querySelector('input')?.value ?? el?.getAttribute('value') ?? '';
}

function setInputValue(id: string, value: string) {
  document.getElementById(id)?.setAttribute('value', value);
}

function getToggleChecked(id: string): boolean {
  return document.getElementById(id)?.getAttribute('checked') === 'true';
}

function setToggleChecked(id: string, value: boolean) {
  document.getElementById(id)?.setAttribute('checked', String(value));
}

document.addEventListener('DOMContentLoaded', async () => {
  let session: Session;
  try {
    session = await getOrCreateSession();
  } catch {
    showAlert({ type: 'error', message: 'Could not initialise session. Please reload.' });
    return;
  }

  let original: UserProfile;
  try {
    const profileRes = await fetch(`/api/v1/users/${session.id}`);
    if (!profileRes.ok) throw new Error(`Failed to load profile: ${profileRes.status}`);
    original = (await profileRes.json()) as UserProfile;
  } catch {
    showAlert({ type: 'error', message: 'Could not load profile. Please reload.' });
    return;
  }

  function populateEditable(profile: UserProfile) {
    setInputValue('username-input', profile.username);
    setInputValue('display-name-input', profile.displayName ?? '');
    setToggleChecked('public-toggle', profile.isPublic);
  }

  populateEditable(original);

  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    populateEditable(original);
  });

  const saveBtn = document.getElementById('save-btn');
  saveBtn?.addEventListener('click', async () => {
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
        showAlert({ type: 'success', message: 'Settings saved.' });
      } else if (res.status === 409) {
        showAlert({ type: 'error', message: 'Username already taken.' });
      } else {
        showAlert({ type: 'error', message: 'Save failed. Please try again.' });
      }
    } finally {
      saveBtn.classList.remove('loading');
    }
  });
});

export {};
```

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/settings/index.ts
git commit -m "feat: use session service and showAlert in settings page"
```
