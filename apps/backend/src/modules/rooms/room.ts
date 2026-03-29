// apps/backend/src/modules/rooms/room.ts

export type Room = {
  id: string;        // UUID — used in API routes and as DO name
  code: string;      // 6-char uppercase alphanumeric, e.g. "X7K2MN"
  name: string;      // 1–64 chars
  creatorId: string;
  createdAt: string; // ISO 8601
};

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ---------------------------------------------------------------------------
// RoomDO — one instance per room, named by room UUID
// Internal fetch protocol:
//   GET  /   → 200 Room JSON | 404
//   PUT  /   body: Room JSON → 204
//   DELETE / → 204
// ---------------------------------------------------------------------------

export class RoomDO {
  constructor(
    private state: DurableObjectState,
    _env: object,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      const room = await this.state.storage.get<Room>('room');
      if (!room) return new Response(null, { status: 404 });
      return Response.json(room);
    }

    if (request.method === 'PUT' && url.pathname === '/') {
      const room = (await request.json()) as Room;
      await this.state.storage.put('room', room);
      return new Response(null, { status: 204 });
    }

    if (request.method === 'DELETE' && url.pathname === '/') {
      await this.state.storage.delete('room');
      return new Response(null, { status: 204 });
    }

    return new Response(null, { status: 405 });
  }
}

// ---------------------------------------------------------------------------
// RoomsRegistry — single instance named "rooms-registry"
// Internal fetch protocol:
//   GET  /rooms           → 200 { rooms: Room[] }
//   GET  /rooms/:id       → 200 Room JSON | 404
//   GET  /codes/:code     → 200 if code exists | 404
//   POST /rooms  body: Room JSON → 204
//   DELETE /rooms/:id     → 204
// ---------------------------------------------------------------------------

export class RoomsRegistry {
  constructor(
    private state: DurableObjectState,
    _env: object,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (request.method === 'GET' && parts[0] === 'rooms' && !parts[1]) {
      const rooms = (await this.state.storage.get<Room[]>('rooms')) ?? [];
      return Response.json({ rooms });
    }

    if (request.method === 'GET' && parts[0] === 'rooms' && parts[1]) {
      const rooms = (await this.state.storage.get<Room[]>('rooms')) ?? [];
      const room = rooms.find((r) => r.id === parts[1]);
      if (!room) return new Response(null, { status: 404 });
      return Response.json(room);
    }

    if (request.method === 'GET' && parts[0] === 'codes' && parts[1]) {
      const rooms = (await this.state.storage.get<Room[]>('rooms')) ?? [];
      const exists = rooms.some((r) => r.code === parts[1]);
      return new Response(null, { status: exists ? 200 : 404 });
    }

    if (request.method === 'POST' && parts[0] === 'rooms') {
      const room = (await request.json()) as Room;
      const rooms = (await this.state.storage.get<Room[]>('rooms')) ?? [];
      rooms.push(room);
      await this.state.storage.put('rooms', rooms);
      return new Response(null, { status: 204 });
    }

    if (request.method === 'DELETE' && parts[0] === 'rooms' && parts[1]) {
      const rooms = (await this.state.storage.get<Room[]>('rooms')) ?? [];
      await this.state.storage.put(
        'rooms',
        rooms.filter((r) => r.id !== parts[1]),
      );
      return new Response(null, { status: 204 });
    }

    return new Response(null, { status: 405 });
  }
}

// ---------------------------------------------------------------------------
// Helper functions — route handlers call these; tests mock the namespaces
// ---------------------------------------------------------------------------

export async function getRoomById(rooms: DurableObjectNamespace, id: string): Promise<Room | null> {
  const stub = rooms.get(rooms.idFromName(id));
  const res = await stub.fetch('https://do/');
  if (res.status === 404) return null;
  return res.json() as Promise<Room>;
}

export async function listRooms(registry: DurableObjectNamespace): Promise<Room[]> {
  const stub = registry.get(registry.idFromName('rooms-registry'));
  const res = await stub.fetch('https://do/rooms');
  const { rooms } = (await res.json()) as { rooms: Room[] };
  return rooms;
}

export async function createRoom(
  rooms: DurableObjectNamespace,
  registry: DurableObjectNamespace,
  data: { name: string; creatorId: string },
): Promise<Room> {
  const registryStub = registry.get(registry.idFromName('rooms-registry'));

  let code: string | null = null;
  for (let i = 0; i < 10; i++) {
    const candidate = generateRoomCode();
    const res = await registryStub.fetch(`https://do/codes/${candidate}`);
    if (res.status === 404) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error('Could not generate unique room code after 10 attempts');

  const room: Room = {
    id: crypto.randomUUID(),
    code,
    name: data.name,
    creatorId: data.creatorId,
    createdAt: new Date().toISOString(),
  };

  const roomStub = rooms.get(rooms.idFromName(room.id));
  await roomStub.fetch('https://do/', {
    method: 'PUT',
    body: JSON.stringify(room),
    headers: { 'Content-Type': 'application/json' },
  });

  await registryStub.fetch('https://do/rooms', {
    method: 'POST',
    body: JSON.stringify(room),
    headers: { 'Content-Type': 'application/json' },
  });

  return room;
}

export async function deleteRoom(
  rooms: DurableObjectNamespace,
  registry: DurableObjectNamespace,
  id: string,
): Promise<void> {
  const roomStub = rooms.get(rooms.idFromName(id));
  await roomStub.fetch('https://do/', { method: 'DELETE' });

  const registryStub = registry.get(registry.idFromName('rooms-registry'));
  await registryStub.fetch(`https://do/rooms/${id}`, { method: 'DELETE' });
}
