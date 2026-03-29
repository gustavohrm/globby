// apps/backend/src/modules/rooms/room.test.ts

import { describe, it, expect } from 'vitest';
import { type Room, generateRoomCode, createRoom, getRoomById, listRooms, deleteRoom } from './room';

// ---------------------------------------------------------------------------
// Mock DO stubs — mirror the internal fetch protocol of RoomDO and RoomsRegistry
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
  // Single registry instance — all idFromName calls point to the same DO
  const singleton = new MockRoomsRegistryDO();
  return {
    idFromName: (_name: string) => 'rooms-registry' as unknown as DurableObjectId,
    get: (_id: DurableObjectId) => singleton as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateRoomCode', () => {
  it('returns a 6-character string', () => {
    expect(generateRoomCode()).toHaveLength(6);
  });

  it('only contains uppercase letters and digits', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateRoomCode()).toMatch(/^[A-Z0-9]{6}$/);
    }
  });
});

describe('createRoom', () => {
  it('returns a room with all required fields', async () => {
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const room = await createRoom(rooms, registry, { name: 'Test Room', creatorId: 'user-1' });

    expect(typeof room.id).toBe('string');
    expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(room.name).toBe('Test Room');
    expect(room.creatorId).toBe('user-1');
    expect(typeof room.createdAt).toBe('string');
  });

  it('created room is retrievable by id', async () => {
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const room = await createRoom(rooms, registry, { name: 'Test Room', creatorId: 'user-1' });

    const fetched = await getRoomById(rooms, room.id);
    expect(fetched).toEqual(room);
  });

  it('created room appears in listing', async () => {
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const room = await createRoom(rooms, registry, { name: 'Test Room', creatorId: 'user-1' });

    const list = await listRooms(registry);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(room);
  });

  it('assigns unique codes when creating multiple rooms', async () => {
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const created = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createRoom(rooms, registry, { name: `Room ${i}`, creatorId: 'user-1' }),
      ),
    );
    const codes = created.map((r) => r.code);
    expect(new Set(codes).size).toBe(10);
  });

  it('retries code generation when there is a collision', async () => {
    // Registry that rejects the first 3 candidates then accepts the 4th
    let callCount = 0;
    const rooms = makeMockRoomsNamespace();
    const registryDO = {
      async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
        const req = typeof input === 'string' ? new Request(input, init) : input;
        const url = new URL(req.url);
        const parts = url.pathname.split('/').filter(Boolean);
        if (req.method === 'GET' && parts[0] === 'codes') {
          callCount++;
          // First 3 code checks → 200 (conflict), 4th onward → 404 (available)
          return new Response(null, { status: callCount <= 3 ? 200 : 404 });
        }
        // Allow POST /rooms and PUT / through normally
        if (req.method === 'POST' && parts[0] === 'rooms') return new Response(null, { status: 204 });
        if (req.method === 'GET' && parts[0] === 'rooms' && !parts[1]) return Response.json({ rooms: [] });
        return new Response(null, { status: 404 });
      },
    };
    const registry = {
      idFromName: (_name: string) => 'rooms-registry' as unknown as DurableObjectId,
      get: (_id: DurableObjectId) => registryDO as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace;

    const room = await createRoom(rooms, registry, { name: 'Retry Room', creatorId: 'user-1' });
    expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(callCount).toBeGreaterThanOrEqual(4);
  });

  it('throws when all 10 code generation attempts result in collisions', async () => {
    const rooms = makeMockRoomsNamespace();
    const alwaysConflictDO = {
      async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
        const req = typeof input === 'string' ? new Request(input, init) : input;
        const url = new URL(req.url);
        const parts = url.pathname.split('/').filter(Boolean);
        if (req.method === 'GET' && parts[0] === 'codes') return new Response(null, { status: 200 });
        return new Response(null, { status: 404 });
      },
    };
    const registry = {
      idFromName: (_name: string) => 'rooms-registry' as unknown as DurableObjectId,
      get: (_id: DurableObjectId) => alwaysConflictDO as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace;

    await expect(createRoom(rooms, registry, { name: 'Doomed Room', creatorId: 'user-1' })).rejects.toThrow(
      'Could not generate unique room code after 10 attempts',
    );
  });
});

describe('getRoomById', () => {
  it('returns null for a non-existent room', async () => {
    const rooms = makeMockRoomsNamespace();
    expect(await getRoomById(rooms, 'does-not-exist')).toBeNull();
  });
});

describe('listRooms', () => {
  it('returns empty array when no rooms exist', async () => {
    const registry = makeMockRegistryNamespace();
    expect(await listRooms(registry)).toEqual([]);
  });
});

describe('deleteRoom', () => {
  it('removes the room from both RoomDO and registry', async () => {
    const rooms = makeMockRoomsNamespace();
    const registry = makeMockRegistryNamespace();
    const room = await createRoom(rooms, registry, { name: 'To Delete', creatorId: 'user-1' });

    await deleteRoom(rooms, registry, room.id);

    expect(await getRoomById(rooms, room.id)).toBeNull();
    expect(await listRooms(registry)).toEqual([]);
  });
});
