# Home Page & Settings UI — Design Spec

**Date:** 2026-03-28
**Scope:** Wire the home page to the lobby API and the settings page to the user management API.

---

## Overview

Two pages get functional (not polished) implementations. The goal is working logic that can be verified end-to-end. A nicer UI will be layered on later.

---

## Approach

Page-specific `index.ts` files co-located with their HTML. No shared modules yet. Both pages share the same `localStorage` key for user identity.

---

## localStorage Schema

Key: `globby_session`
Value: `{ id: string; secret: string }`

Both pages read and write this key. If it's missing on page load, the page auto-creates a user via `POST /api/v1/users` and stores the result.

---

## Home Page

**Files changed:**

- `apps/frontend/index.html` — add `<script type="module" src="./index.ts">`
- `apps/frontend/index.ts` — new file

**Behaviour:**

1. On `DOMContentLoaded`: read `globby_session` from localStorage. If absent, `POST /api/v1/users`, store `{ id, secret }`.
2. Fetch `GET /api/v1/lobby/users`.
3. Render into a `<div id="lobby">` inserted into the page's `<main>` (inside `<app-shell>`).

**Render states:**

- **Loading** — text "Loading..."
- **Empty** — text "No one in the lobby yet."
- **List** — `<ul>` of compact rows. Each row: avatar circle (first 2 chars of username, uppercased) + username + displayName (if set, shown dimmed alongside).

**Layout:** Single column, compact rows, inside a `<div class="mx-auto w-full max-w-3xl flex-1 flex flex-col gap-4 pt-4">` injected as a child of `<app-shell>` in the HTML (same pattern as the settings page). The script targets `#lobby` inside that container.

**Shell rendering note:** `app-shell` renders synchronously in `connectedCallback`, so `document.querySelector('main')` is available by `DOMContentLoaded`.

---

## Settings Page

**Files changed:**

- `apps/frontend/settings/index.html` — add `id` attributes to form elements + `<script type="module" src="./index.ts">`
- `apps/frontend/settings/index.ts` — new file

**Form elements (IDs):**

- `#username-input` — `app-input`, readonly
- `#display-name-input` — `app-input`, editable
- `#public-toggle` — `app-toggle` (already has `id="public-toggle"`)
- `#cancel-btn` — secondary button
- `#save-btn` — primary button

**Behaviour:**

1. On `DOMContentLoaded`: same identity bootstrap as home page.
2. `GET /api/v1/users/:id` — fetch current profile.
3. Populate fields:
   - `#username-input` → `user.username`. The `app-input` component doesn't support `readonly` natively; after setting the `value` attribute, query the inner `<input>` and set its `readonly` property directly.
   - `#display-name-input` → `user.displayName ?? ''`
   - `#public-toggle` → set `checked` attribute to `String(user.isPublic)`
4. Store fetched profile as `original` for cancel.
5. **Save:**
   - Add `loading` class to `#save-btn`
   - `PATCH /api/v1/users/:id` with `Authorization: Bearer <secret>`, body `{ displayName, isPublic }`
   - On success: update `original` with new values, remove `loading` class
   - On error: remove `loading` class (no error UI for now)
6. **Cancel:** Reset all fields back to `original` values.

---

## Out of Scope

- Username editing (backend doesn't support it yet)
- Error UI / toast notifications
- Optimistic updates
- Real-time lobby refresh
