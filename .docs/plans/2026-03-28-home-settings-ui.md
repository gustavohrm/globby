# Home Page & Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the home page to the lobby API and the settings page to the user management API, with auto-created anonymous identity stored in `localStorage`.

**Architecture:** Two co-located page scripts (`apps/frontend/index.ts` and `apps/frontend/settings/index.ts`), each responsible for their own page. No shared modules. Both pages share the `globby_session` localStorage key (`{ id, secret }`). If the key is absent, the page silently creates a user via `POST /api/v1/users` before doing anything else.

**Tech Stack:** Vanilla TypeScript, Cloudflare Workers backend, Vitest (backend only — no frontend tests in this project)

---

## File Map

| Action | Path                                | Responsibility                                             |
| ------ | ----------------------------------- | ---------------------------------------------------------- |
| Modify | `apps/frontend/index.html`          | Add content container + lobby placeholder + script tag     |
| Create | `apps/frontend/index.ts`            | Bootstrap session, fetch lobby, render compact list        |
| Modify | `apps/frontend/settings/index.html` | Add IDs to form elements + display name input + script tag |
| Create | `apps/frontend/settings/index.ts`   | Bootstrap session, load profile, handle save/cancel        |
| Modify | `.gitignore`                        | Add `.superpowers/` (brainstorm artefacts)                 |

---

## Task 1: Add `.superpowers/` to `.gitignore`

**Files:**

- Modify: `.gitignore`

- [ ] **Step 1: Add entry**

In `.gitignore`, add after the `wrangler.jsonc` line:

```
# Brainstorming artefacts
.superpowers
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm artefacts"
```

---

## Task 2: Home page — session bootstrap + lobby list

**Files:**

- Modify: `apps/frontend/index.html`
- Create: `apps/frontend/index.ts`

- [ ] **Step 1: Update `index.html`**

Replace the current body content:

```html
<body>
  <app-shell>
    <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 pt-4">
      <h1 class="text-2xl font-bold">Lobby</h1>
      <div id="lobby">Loading...</div>
    </div>
  </app-shell>
  <script type="module" src="./index.ts"></script>
</body>
```

- [ ] **Step 2: Create `apps/frontend/index.ts`**

```typescript
const SESSION_KEY = 'globby_session';

interface Session {
  id: string;
  secret: string;
}

interface LobbyUser {
  id: string;
  username: string;
  displayName: string | null;
}

async function getOrCreateSession(): Promise<Session> {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) return JSON.parse(raw) as Session;

  const res = await fetch('/api/v1/users', { method: 'POST' });
  const data = (await res.json()) as { id: string; username: string; secret: string };
  const session: Session = { id: data.id, secret: data.secret };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function initials(username: string): string {
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
          ${initials(u.username)}
        </div>
        <div>
          <div class="font-medium">${u.username}</div>
          ${u.displayName ? `<div class="text-sm text-text-secondary">${u.displayName}</div>` : ''}
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
    const { users } = (await res.json()) as { users: LobbyUser[] };
    lobbyEl.innerHTML = renderLobby(users);
  } catch {
    lobbyEl.textContent = 'Failed to load lobby.';
  }
});
```

- [ ] **Step 3: Verify manually**

Run `npm run preview:local` and open `http://localhost:5173` (or the wrangler dev port).

- The browser console should show no errors.
- `localStorage.getItem('globby_session')` in DevTools should return `{ id, secret }` after first load.
- The lobby section shows "No one in the lobby yet." (since no users are public by default).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/index.html apps/frontend/index.ts
git commit -m "feat: wire home page to lobby API with session bootstrap"
```

---

## Task 3: Settings page — load and save profile

**Files:**

- Modify: `apps/frontend/settings/index.html`
- Create: `apps/frontend/settings/index.ts`

- [ ] **Step 1: Update `settings/index.html`**

Replace the body content with:

```html
<body>
  <app-shell>
    <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 pt-4">
      <h1 class="text-2xl font-bold">Settings</h1>

      <app-input id="username-input" label="Username" placeholder="Loading..."></app-input>
      <app-input id="display-name-input" label="Display name" placeholder="Optional display name"></app-input>
      <label class="flex items-center justify-between gap-2">
        Make profile public
        <app-toggle id="public-toggle"></app-toggle>
      </label>
      <div class="flex items-center justify-end gap-4">
        <button id="cancel-btn" class="secondary-btn">Cancel</button>
        <button id="save-btn" class="primary-btn">Save</button>
      </div>
    </div>
  </app-shell>
  <script type="module" src="./index.ts"></script>
</body>
```

- [ ] **Step 2: Create `apps/frontend/settings/index.ts`**

```typescript
const SESSION_KEY = 'globby_session';

interface Session {
  id: string;
  secret: string;
}

interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  isPublic: boolean;
}

async function getOrCreateSession(): Promise<Session> {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) return JSON.parse(raw) as Session;

  const res = await fetch('/api/v1/users', { method: 'POST' });
  const data = (await res.json()) as { id: string; username: string; secret: string };
  const session: Session = { id: data.id, secret: data.secret };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function getInputValue(id: string): string {
  const el = document.getElementById(id);
  // Read from inner <input> for current value (attribute may lag behind if user hasn't blurred)
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
  const session = await getOrCreateSession();

  const profileRes = await fetch(`/api/v1/users/${session.id}`);
  let original = (await profileRes.json()) as UserProfile;

  // Username is set once and made readonly — never updated again so re-render won't occur
  setInputValue('username-input', original.username);
  document.getElementById('username-input')?.querySelector('input')?.setAttribute('readonly', '');

  function populateEditable(profile: UserProfile) {
    setInputValue('display-name-input', profile.displayName ?? '');
    setToggleChecked('public-toggle', profile.isPublic);
  }

  populateEditable(original);

  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    populateEditable(original);
  });

  document.getElementById('save-btn')?.addEventListener('click', async () => {
    const saveBtn = document.getElementById('save-btn');
    saveBtn?.classList.add('loading');

    const displayName = getInputValue('display-name-input') || null;
    const isPublic = getToggleChecked('public-toggle');

    try {
      const res = await fetch(`/api/v1/users/${session.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.secret}`,
        },
        body: JSON.stringify({ displayName, isPublic }),
      });

      if (res.ok) {
        original = (await res.json()) as UserProfile;
        populateEditable(original);
      }
    } finally {
      saveBtn?.classList.remove('loading');
    }
  });
});
```

- [ ] **Step 3: Verify manually**

With `npm run preview:local` running:

1. Open `/settings/` — username field should auto-populate from the API and be non-editable.
2. Type a display name and click **Save** — button should show a loading spinner briefly, then settle.
3. Reload the page — display name should still be there (fetched fresh from API).
4. Change display name, click **Cancel** — field reverts to the last saved value.
5. Toggle "Make profile public" on and save. Open the home page (`/`) — your username should now appear in the lobby list.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/settings/index.html apps/frontend/settings/index.ts
git commit -m "feat: wire settings page to user management API"
```
