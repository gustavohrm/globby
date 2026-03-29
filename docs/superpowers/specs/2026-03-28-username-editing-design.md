# Username Editing — Design Spec

**Date:** 2026-03-28

## Problem

Two issues with the current username system:

1. **`createUser` collision gap** — on username collision, the code falls back to `generateUsernameWithSuffix()` exactly once, without verifying whether the suffixed name is also taken.
2. **Username is immutable** — there is no backend support or frontend UI for users to change their username after account creation.

---

## Scope

- Fix the collision gap in `createUser`
- Add a `changeUsername` backend function
- Extend the PATCH route to accept a `username` field
- Make the username input editable in the settings UI

Out of scope: username history, reclaim cooldowns, Durable Objects coordination (deferred — see Known Limitations).

---

## Backend

### `createUser` — retry loop

Replace the one-shot fallback with a loop. Try a plain username first; on collision, generate a new suffixed candidate and retry. Attempt up to 10 times before throwing an error. The error case is vanishingly unlikely given the available name space but must not silently produce a duplicate.

### `changeUsername(kv, user, newUsername): Promise<User | 'conflict'>`

New export in `apps/backend/src/modules/users/user.ts`.

**Contract:**
- If `newUsername === user.username`, return the user unchanged (no-op).
- Look up `username:{newUsername}` in KV. If it exists, return `'conflict'`.
- Delete `username:{oldUsername}`.
- Put `username:{newUsername}` → `user.id`.
- Persist the updated user record.
- Return the updated `User`.

**Validation is the caller's responsibility** — this function assumes the value is already well-formed.

> **Known limitation:** Cloudflare KV has no atomic compare-and-swap. Two concurrent requests claiming the same username will both pass the uniqueness check; the last write wins on the index, leaving one user's record inconsistent. This window is narrow and the operation is rare, making the practical risk low. When Durable Objects are introduced for other features, username claiming should be moved there to eliminate this race entirely.

### PATCH `/api/v1/users/:id` — username field

Accept an optional `username` field in the request body alongside the existing `displayName` and `isPublic` fields.

**Validation:** `/^[a-zA-Z0-9-]{3,32}$/` — alphanumeric and hyphens, 3–32 characters. Invalid value → `400 Bad Request`.

**Flow:**
1. Authenticate (existing logic).
2. If `username` is present and valid, call `changeUsername`. On `'conflict'` → `409 Conflict` with `{ error: 'Username already taken' }`.
3. Call `updateUser` for `displayName`/`isPublic` (existing logic, unchanged).
4. Return the final profile via `toPublicProfile`.

Both changes are applied in the same PATCH request.

---

## Frontend — Settings page (`apps/frontend/settings/index.ts`)

- **Remove `readonly`** from the username input — it becomes a regular editable field.
- **Save payload** — include `username` only when it differs from `original.username`, to avoid unnecessary writes.
- **Error handling** — handle `409` specifically with the message "Username already taken", displayed via the existing `save-error` pattern. All other non-OK responses show the generic "Save failed" message.
- **On success** — update `original` with the full returned profile (username now included), consistent with existing behaviour.

---

## Files Changed

| Action | Path |
|--------|------|
| Modify | `apps/backend/src/modules/users/user.ts` |
| Modify | `apps/backend/src/routes/v1/users/index.ts` |
| Modify | `apps/frontend/settings/index.ts` |
| Modify | `apps/backend/src/routes/v1/users/index.test.ts` |
