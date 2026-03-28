# Users & Lobby — Backend Design

**Date:** 2026-03-28
**Scope:** Backend only. Frontend integration deferred.

---

## Overview

Users in Globby are anonymous — no sign-up or login required. When a user is first created, they receive a randomly generated UUID, a human-readable username (adjective + noun), and a private secret token used to authenticate future requests. A display name is optional and editable. User profiles are private by default; users can opt in to appear in the lobby.

The lobby exposes a list of public users (and, in the future, public rooms). This design covers the users feature and the `lobby/users` endpoint only. `lobby/rooms` is reserved for a future spec.

---

## Data Model

Users are stored in Cloudflare Workers KV under the binding `USERS_KV`.

### `user:{uuid}`

```json
{
  "id": "uuid-v4",
  "username": "SilentOtter",
  "displayName": null,
  "secret": "uuid-v4-secret",
  "isPublic": false,
  "createdAt": "2026-03-28T00:00:00.000Z"
}
```

- `id` — public identifier, UUID v4
- `username` — auto-generated adjective+noun, immutable after creation
- `displayName` — optional string, user-editable, `null` by default
- `secret` — UUID v4, returned once at creation, used as Bearer token for auth; never exposed again
- `isPublic` — whether the user appears in the lobby; `false` by default
- `createdAt` — ISO timestamp

### `lobby:users`

```json
["uuid1", "uuid2", "uuid3"]
```

An array of IDs of users who have `isPublic: true`. Updated in the same handler as the user record whenever `isPublic` changes (two sequential KV writes — KV has no transactions). This avoids scanning all users on lobby reads.

---

## API Endpoints

All routes are under `/api/v1/`.

### `POST /api/v1/users`

Creates a new user. No request body required.

**Response 201:**
```json
{
  "id": "550e8400-...",
  "username": "SilentOtter",
  "secret": "6ba7b810-..."
}
```

The `secret` is only returned here. The client is responsible for storing it.

---

### `GET /api/v1/users/:id`

Returns the public profile of a user. The `secret` field is never included.

**Response 200:**
```json
{
  "id": "550e8400-...",
  "username": "SilentOtter",
  "displayName": null,
  "isPublic": false
}
```

**Response 404:**
```json
{ "error": "User not found" }
```

---

### `PATCH /api/v1/users/:id`

Updates `displayName` and/or `isPublic`. Requires `Authorization: Bearer <secret>`.

**Request body** (all fields optional):
```json
{
  "displayName": "Alice",
  "isPublic": true
}
```

**Response 200:** Updated public profile (same shape as `GET /api/v1/users/:id`).

**Response 400:** `{ "error": "Invalid request body" }` — malformed JSON or wrong types.

**Response 401:** `{ "error": "Unauthorized" }` — missing, malformed, or incorrect secret.

**Response 404:** `{ "error": "User not found" }`.

When `isPublic` changes, the `lobby:users` index is updated in the same operation.

---

### `GET /api/v1/lobby/users`

Returns all users who have opted in to public visibility.

**Response 200:**
```json
{
  "users": [
    { "id": "...", "username": "SilentOtter", "displayName": null }
  ]
}
```

No auth required. Only `id`, `username`, and `displayName` are exposed — not `isPublic`, `secret`, or `createdAt`.

---

## Router Extension

The existing `Router` class is extended to support `:param` path segments. Pattern `/api/v1/users/:id` will match `/api/v1/users/abc123` and extract `{ id: "abc123" }`.

Route handlers gain a second argument:

```ts
type RouteHandler = (
  request: Request,
  params: Record<string, string>,
  env: Env,
) => Response | Promise<Response>;
```

The `Env` type (containing the `USERS_KV` binding) is introduced in the worker entry point and threaded through the router to all handlers.

---

## Module Structure

```
apps/backend/src/
  routes/
    router.ts                  # Extended with :param support
    router.test.ts
    index.ts                   # Route registration
    v1/
      status/
        index.ts
        index.test.ts
      users/
        index.ts               # POST /api/v1/users, GET + PATCH /api/v1/users/:id
        index.test.ts
      lobby/
        index.ts               # GET /api/v1/lobby/users
        index.test.ts
  modules/
    users/
      index.ts                 # Re-exports: User type, KV helpers, auth
      user.ts                  # User type definition + KV read/write helpers
      username.ts              # Adjective+noun username generator
      auth.ts                  # Bearer secret extraction + validation helper
```

---

## Username Generation

A built-in word list (~50 adjectives × ~50 nouns = 2,500 combinations). No external dependency. On the rare collision, a random 2-digit suffix is appended (e.g., `SilentOtter42`). The generator lives in `modules/users/username.ts`.

---

## Auth

Requests to `PATCH /api/v1/users/:id` must include:

```
Authorization: Bearer <secret>
```

The secret is extracted from the header and compared to the stored `secret` field for the given user ID. Returns `401` if the header is missing, malformed, or the secret does not match.

---

## KV Configuration

A new KV namespace `USERS_KV` is added to `wrangler.jsonc`. For local development (`preview:local`), Wrangler provides a local KV simulation automatically.

---

## Testing

Tests are co-located with route files (`index.test.ts`), following the existing pattern. Since Vitest runs outside the Workers runtime, handlers accept `env` as a parameter. Tests pass a mock KV object backed by a `Map`, implementing `get`, `put`, `delete`, and `list`.

Error cases covered per route:
- `POST /api/v1/users` — successful creation
- `GET /api/v1/users/:id` — found, not found
- `PATCH /api/v1/users/:id` — success, missing auth, wrong secret, not found, invalid body
- `GET /api/v1/lobby/users` — empty list, populated list

---

## Out of Scope

- `GET /api/v1/lobby/rooms` — reserved, not implemented in this spec
- Frontend integration
- User deletion
- Username changes
