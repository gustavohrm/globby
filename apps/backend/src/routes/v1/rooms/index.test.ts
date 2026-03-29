// apps/backend/src/routes/v1/rooms/index.test.ts

import { describe, it, expect } from 'vitest';
import { handle } from '../../router';
import './index';
import '../users/index';
import type { Env } from '../../../../index';
import type { Room } from '../../../modules/rooms';

// ---------------------------------------------------------------------------
// Mock DO stubs (same protocol as in room.test.ts)
// ---------------------------------------------------------------------------

class MockRoomDO {
  private room: Room | null = null;

  async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const req = typeof input === 'string' ? new Request(input, init) : input;
    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/') {
      if (!this.room) return new Response(null, { status: 404 });
      return Response.json(this.room);
    }
    if (req.method === 'PUT' && url.pathname === '/') {
      this.room = (await req.json()) as Room;
      return new Response(null, { status: 204 });
    }
    if (req.method === 'DELETE' && url.pathname === '/') {
      this.room = null;
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  }
}

class MockRoomsRegistryDO {
  private rooms = new Map<string, Room>();

  async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const req = typeof input === 'string' ? new Request(input, init) : input;
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && parts[0] === 'rooms' && !parts[1]) {
      return Response.json({ rooms: Array.from(this.rooms.values()) });
    }
    if (req.method === 'GET' && parts[0] === 'rooms' && parts[1]) {
      const room = this.rooms.get(parts[1]);
      return room ? Response.json(room) : new Response(null, { status: 404 });
    }
    if (req.method === 'GET' && parts[0] === 'codes' && parts[1]) {
      const exists = Array.from(this.rooms.values()).some((r) => r.code === parts[1]);
      return new Response(null, { status: exists ? 200 : 404 });
    }
    if (req.method === 'POST' && parts[0] === 'rooms') {
      const room = (await req.json()) as Room;
      this.rooms.set(room.id, room);
      return new Response(null, { status: 204 });
    }
    if (req.method === 'DELETE' && parts[0] === 'rooms' && parts[1]) {
      this.rooms.delete(parts[1]);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  }
}

function makeMockRoomsNamespace(): DurableObjectNamespace {
  const instances = new Map<string, MockRoomDO>();
  return {
    idFromName: (name: string) => name as unknown as DurableObjectId,
    get: (id: DurableObjectId) => {
      const key = String(id);
      if (!instances.has(key)) instances.set(key, new MockRoomDO());
      return instances.get(key) as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function makeMockRegistryNamespace(): DurableObjectNamespace {
  const singleton = new MockRoomsRegistryDO();
  return {
    idFromName: (_name: string) => 'rooms-registry' as unknown as DurableObjectId,
    get: (_id: DurableObjectId) => singleton as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace;
}

function makeMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
    async list() { return { keys: [], list_complete: true, cursor: '' }; },
  } as unknown as KVNamespace;
}

function makeEnv(kv: KVNamespace, rooms: DurableObjectNamespace, registry: DurableObjectNamespace): Env {
  return { USERS_KV: kv, ROOMS: rooms, ROOMS_REGISTRY: registry };
}

// Creates a user and returns { id, secret }
async function createUser(kv: KVNamespace): Promise<{ id: string; secret: string }> {
  const res = await handle(new Request('http://localhost/api/v1/users', { method: 'POST' }), { USERS_KV: kv } as unknown as Env);
  return res.json() as Promise<{ id: string; secret: string }>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/v1/rooms', () => {
  it('creates a room and returns 201 with full room data', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId, secret } = await createUser(kv);

    const res = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ name: 'My Room', creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as Room;
    expect(typeof body.id).toBe('string');
    expect(body.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(body.name).toBe('My Room');
    expect(body.creatorId).toBe(creatorId);
    expect(typeof body.createdAt).toBe('string');
  });

  it('trims whitespace from the room name before storing', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId, secret } = await createUser(kv);

    const res = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ name: '  My Room  ', creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as Room;
    expect(body.name).toBe('My Room');
  });

  it('returns 401 with no Authorization header', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId } = await createUser(kv);

    const res = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Room', creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 with wrong secret', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId } = await createUser(kv);

    const res = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-secret' },
        body: JSON.stringify({ name: 'My Room', creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when creatorId does not match the authenticated user', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { secret } = await createUser(kv);
    const { id: otherUserId } = await createUser(kv);

    // Authenticated as user A but claiming to be user B
    const res = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ name: 'My Room', creatorId: otherUserId }),
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when name is missing', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId, secret } = await createUser(kv);

    const res = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request body' });
  });

  it('returns 400 when name exceeds 64 characters', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId, secret } = await createUser(kv);

    const res = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ name: 'A'.repeat(65), creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request body' });
  });

  it('returns 400 when name is an empty string', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId, secret } = await createUser(kv);

    const res = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ name: '', creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request body' });
  });

  it('returns 400 with invalid JSON body', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { secret } = await createUser(kv);

    const res = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        body: 'not json',
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request body' });
  });
});

describe('GET /api/v1/rooms', () => {
  it('returns empty rooms array initially', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();

    const res = await handle(
      new Request('http://localhost/api/v1/rooms'),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rooms: [] });
  });

  it('returns created rooms', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId, secret } = await createUser(kv);

    await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ name: 'Room A', creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );

    const res = await handle(
      new Request('http://localhost/api/v1/rooms'),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(200);
    const { rooms: list } = (await res.json()) as { rooms: Room[] };
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Room A');
  });
});

describe('GET /api/v1/rooms/:id', () => {
  it('returns the room when it exists', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId, secret } = await createUser(kv);

    const createRes = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ name: 'My Room', creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );
    const { id } = (await createRes.json()) as Room;

    const res = await handle(
      new Request(`http://localhost/api/v1/rooms/${id}`),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Room;
    expect(body.id).toBe(id);
    expect(body.name).toBe('My Room');
  });

  it('returns 404 for non-existent room', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();

    const res = await handle(
      new Request('http://localhost/api/v1/rooms/does-not-exist'),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Room not found' });
  });
});

describe('DELETE /api/v1/rooms/:id', () => {
  it('deletes the room and returns 204', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId, secret } = await createUser(kv);

    const createRes = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ name: 'My Room', creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );
    const { id } = (await createRes.json()) as Room;

    const deleteRes = await handle(
      new Request(`http://localhost/api/v1/rooms/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${secret}`, 'X-User-Id': creatorId },
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(deleteRes.status).toBe(204);

    const getRes = await handle(
      new Request(`http://localhost/api/v1/rooms/${id}`),
      makeEnv(kv, rooms, registry),
    );
    expect(getRes.status).toBe(404);
  });

  it('returns 403 when non-creator tries to delete', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: creatorId, secret: creatorSecret } = await createUser(kv);
    const { id: otherId, secret: otherSecret } = await createUser(kv);

    const createRes = await handle(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creatorSecret}` },
        body: JSON.stringify({ name: 'My Room', creatorId }),
      }),
      makeEnv(kv, rooms, registry),
    );
    const { id } = (await createRes.json()) as Room;

    const res = await handle(
      new Request(`http://localhost/api/v1/rooms/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${otherSecret}`, 'X-User-Id': otherId },
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 401 with no Authorization header', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();

    const res = await handle(
      new Request('http://localhost/api/v1/rooms/some-id', {
        method: 'DELETE',
        headers: { 'X-User-Id': 'user-1' },
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 with no X-User-Id header', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();

    const res = await handle(
      new Request('http://localhost/api/v1/rooms/some-id', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer some-secret' },
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when X-User-Id does not match the Authorization secret', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: userAId, secret: secretA } = await createUser(kv);
    const { id: userBId } = await createUser(kv);

    // Secret belongs to user A but X-User-Id claims user B
    const res = await handle(
      new Request('http://localhost/api/v1/rooms/some-room-id', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${secretA}`, 'X-User-Id': userBId },
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 for non-existent room', async () => {
    const kv = makeMockKV();
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const { id: userId, secret } = await createUser(kv);

    const res = await handle(
      new Request('http://localhost/api/v1/rooms/does-not-exist', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${secret}`, 'X-User-Id': userId },
      }),
      makeEnv(kv, rooms, registry),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Room not found' });
  });
});
