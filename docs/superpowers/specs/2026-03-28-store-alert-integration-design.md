# Store & Alert Integration Design

**Date:** 2026-03-28
**Scope:** Wire up the new `store` module and `alert` system into the app; extract a session service to eliminate duplication.

---

## Context

Two new frontend modules were implemented:

- **`_core/modules/store/`** — typed `localStorage` abstraction (`createStore`)
- **`_ui/scripts/alert/`** — global UI feedback system (`showAlert`)

Neither is used by the app yet. `apps/frontend/index.ts` and `apps/frontend/settings/index.ts` both duplicate the same raw `localStorage` session logic and use inline DOM injection for error feedback.

---

## Architecture

Three layers:

| Layer | Location | Responsibility |
|---|---|---|
| Module | `_core/modules/store/` | Typed localStorage wrapper (already done) |
| Service | `_core/services/session/` | Session business logic and persistence |
| Page logic | `apps/frontend/*.ts` | User-facing orchestration |

---

## Changes

### 1. Install jsdom

Install `jsdom` as a dev dependency so `// @vitest-environment jsdom` directives are recognised by Vitest.

### 2. Fix store test

Move `// @vitest-environment jsdom` to line 1 in `_core/modules/store/index.test.ts` (currently placed after imports, where Vitest does not read it).

### 3. New: `_core/services/session/index.ts`

Owns the session storage key, `Session` type, and `getOrCreateSession()` workflow.

- Uses `createStore<Session>` with `initialState: { id: '', secret: '' }`
- `getOrCreateSession()`:
  1. Read from store; if `stored.id && stored.secret` are present, return immediately
  2. Otherwise `POST /api/v1/users`, persist `{ id, secret }` via `store.set()`, return session
- Exports: `Session` type, `getOrCreateSession`
- No try/catch needed for corrupted JSON — the store's fallback to `initialState` handles it

### 4. Update `apps/frontend/index.ts`

- Remove: `SESSION_KEY`, `Session` interface, `getOrCreateSession` function
- Add import: `getOrCreateSession` from `_core/services/session`
- No alert changes needed on this page (lobby load failure is out of scope)

### 5. Update `apps/frontend/settings/index.ts`

- Remove: `SESSION_KEY`, `Session` interface, `getOrCreateSession` function, `save-error` element cleanup
- Add imports: `getOrCreateSession` from `_core/services/session`, `showAlert` from `_ui/scripts/alert`
- Replace all inline DOM error feedback with `showAlert` calls:

| Trigger | Alert |
|---|---|
| Session init failure | `showAlert({ type: 'error', message: 'Could not initialise session. Please reload.' })` |
| Profile load failure | `showAlert({ type: 'error', message: 'Could not load profile. Please reload.' })` |
| Save success | `showAlert({ type: 'success', message: 'Settings saved.' })` |
| Save 409 conflict | `showAlert({ type: 'error', message: 'Username already taken.' })` |
| Save other error | `showAlert({ type: 'error', message: 'Save failed. Please try again.' })` |

---

## What is not changing

- The `store` module implementation — no changes
- The `alert` module implementation — no changes
- The home page lobby rendering logic
- Any backend code
