// apps/backend/src/routes/v1/rooms/index.ts

import { register } from '../../router';
import { createRoom, getRoomById, listRooms, deleteRoom } from '../../../modules/rooms';
import { getUser, extractBearer } from '../../../modules/users';
import type { Env } from '../../../../index';

register<Env>({
  method: 'POST',
  path: '/api/v1/rooms',
  handler: async (req, _params, env) => {
    const secret = extractBearer(req);
    if (!secret) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: { name?: unknown; creatorId?: unknown };
    try {
      body = (await req.json()) as { name?: unknown; creatorId?: unknown };
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (
      typeof body.name !== 'string' ||
      body.name.trim().length === 0 ||
      body.name.length > 64 ||
      typeof body.creatorId !== 'string' ||
      body.creatorId.trim().length === 0
    ) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const user = await getUser(env.USERS_KV, body.creatorId as string);
    if (!user || user.secret !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const room = await createRoom(env.ROOMS, env.ROOMS_REGISTRY, {
      name: (body.name as string).trim(),
      creatorId: body.creatorId as string,
    });

    return Response.json(room, { status: 201 });
  },
});

register<Env>({
  method: 'GET',
  path: '/api/v1/rooms',
  handler: async (_req, _params, env) => {
    const rooms = await listRooms(env.ROOMS_REGISTRY);
    return Response.json({ rooms });
  },
});

register<Env>({
  method: 'GET',
  path: '/api/v1/rooms/:id',
  handler: async (_req, params, env) => {
    const room = await getRoomById(env.ROOMS, params.id);
    if (!room) return Response.json({ error: 'Room not found' }, { status: 404 });
    return Response.json(room);
  },
});

register<Env>({
  method: 'DELETE',
  path: '/api/v1/rooms/:id',
  handler: async (req, params, env) => {
    const secret = extractBearer(req);
    if (!secret) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = req.headers.get('X-User-Id');
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUser(env.USERS_KV, userId);
    if (!user || user.secret !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const room = await getRoomById(env.ROOMS, params.id);
    if (!room) return Response.json({ error: 'Room not found' }, { status: 404 });

    if (room.creatorId !== userId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    await deleteRoom(env.ROOMS, env.ROOMS_REGISTRY, params.id);
    return new Response(null, { status: 204 });
  },
});
