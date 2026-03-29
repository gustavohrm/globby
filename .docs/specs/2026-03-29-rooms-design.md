# Rooms Feature Design

**Date:** 2026-03-29
**Scope:** Backend only. UI will be implemented separately once the backend is working.

## Overview

Users can create, list, view, and delete public rooms. Chat is out of scope for this phase. The foundation is designed to support future features: presence, messaging, join codes, and private rooms.

## Architecture

Two Durable Objects:

- **`RoomDO`** — one instance per room, named by room ID (UUID). Owns individual room state. Designed to grow into the authoritative store for connections, messages, and presence.
- **`RoomsRegistry`** — single instance (named `"rooms-registry"`). Maintains the full list of rooms for discovery. Strongly consistent — listing is always fresh.

`Env` gains two new bindings:

```ts
ROOMS: DurableObjectNamespace        // per-room DOs
ROOMS_REGISTRY: DurableObjectNamespace  // single registry DO
```

## Data Model

```ts
type Room = {
  id: string;        // UUID — internal identifier, used in API routes and DO names
  code: string;      // Short uppercase alphanumeric (e.g. "X7K2MN") — display/share identifier
  name: string;      // 1–64 chars
  creatorId: string; // ID of the user who created the room
  createdAt: string; // ISO 8601
};
```

`RoomDO` stores its `Room` in Durable Object storage (`this.state.storage`).

`RoomsRegistry` stores a `Room[]` array — full metadata denormalized so listing does not require N fetches to individual DOs.

### Code generation

- 6-character uppercase alphanumeric (A-Z, 0-9), giving ~2.2 billion combinations.
- Generated at creation time: try a random code, check the registry for conflicts, retry up to 9 times.
- Since `RoomsRegistry` is a DO (strongly consistent), uniqueness checks are reliable.

## API Endpoints

| Method   | Path                  | Auth            | Description                        |
|----------|-----------------------|-----------------|------------------------------------|
| `POST`   | `/api/v1/rooms`       | Bearer required | Create a room                      |
| `GET`    | `/api/v1/rooms`       | None            | List all rooms                     |
| `GET`    | `/api/v1/rooms/:id`   | None            | Get a single room by ID            |
| `DELETE` | `/api/v1/rooms/:id`   | Bearer required | Delete a room (creator only)       |

### POST /api/v1/rooms

Request body:
```json
{ "name": "My Room", "creatorId": "<userId>" }
```

Validation:
- `name` must be a non-empty string, max 64 chars.
- `creatorId` must be a non-empty string.
- Bearer token must match the secret of the user identified by `creatorId` (`extractBearer` + `getUser`).

Returns `201` with the full `Room` object.

### GET /api/v1/rooms

No auth required. Returns `200`:
```json
{ "rooms": [ ...Room ] }
```

### GET /api/v1/rooms/:id

No auth required. Returns `200` with `Room`, or `404` if not found.

### DELETE /api/v1/rooms/:id

Requires `Authorization: Bearer <secret>` and `X-User-Id: <userId>` header. The user identified by `X-User-Id` must be the room's creator.

Returns `401` if bearer or user ID is missing/invalid, `403` if the authenticated user is not the creator, `404` if room not found, `204` on success.

All errors follow the existing pattern: `{ "error": "..." }`.

## Module Structure

```
apps/backend/
  index.ts                          # Add ROOMS + ROOMS_REGISTRY to Env
  src/
    modules/
      rooms/
        room.ts                     # Room type, RoomDO class, RoomsRegistry class, helpers
        index.ts                    # Re-exports
    routes/
      index.ts                      # Add import './v1/rooms'
      v1/
        rooms/
          index.ts                  # Route handlers
          index.test.ts             # Tests
```

`RoomDO` and `RoomsRegistry` both live in `room.ts` — they are tightly coupled to the `Room` type and small enough to coexist. Split them if they grow.

## Testing

- Co-located `index.test.ts`, Vitest, same `clearRoutes()` pattern as existing route tests.
- DOs are stubbed with simple in-memory classes implementing the same interface (`MockRoomDO`, `MockRoomsRegistry`).
- Mock DO namespaces are injected via `env` in each test.
- Tests cover: create (valid, invalid body, auth failure), list, get (found, not found), delete (creator, non-creator, not found).

## Future Considerations

- Per-room DOs are the foundation for: live user count, presence, messaging, and private rooms.
- `code` field becomes the join code when join-by-code is implemented.
- `isPublic` can be added to `Room` when private rooms are needed.
- `RoomsRegistry` may need pagination when the room count grows.
