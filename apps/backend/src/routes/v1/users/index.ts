import { register } from '../../router';
import { createUser, getUser, updateUser, toPublicProfile, extractBearer, changeUsername } from '../../../modules/users';
import type { Env } from '../../../../index';

register<Env>({
  method: 'POST',
  path: '/api/v1/users',
  handler: async (_req, _params, env) => {
    const user = await createUser(env.USERS_KV);
    return Response.json({ id: user.id, username: user.username, secret: user.secret }, { status: 201 });
  },
});

register<Env>({
  method: 'GET',
  path: '/api/v1/users/:id',
  handler: async (_req, params, env) => {
    const user = await getUser(env.USERS_KV, params.id);
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });
    return Response.json(toPublicProfile(user));
  },
});

register<Env>({
  method: 'PATCH',
  path: '/api/v1/users/:id',
  handler: async (req, params, env) => {
    const secret = extractBearer(req);
    if (!secret) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let user = await getUser(env.USERS_KV, params.id);
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    if (user.secret !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { username?: unknown; displayName?: unknown; isPublic?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const USERNAME_RE = /^[a-zA-Z0-9-]{3,32}$/;

    if (
      (body.username !== undefined &&
        (typeof body.username !== 'string' || !USERNAME_RE.test(body.username))) ||
      (body.displayName !== undefined &&
        body.displayName !== null &&
        typeof body.displayName !== 'string') ||
      (body.isPublic !== undefined && typeof body.isPublic !== 'boolean')
    ) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (body.username !== undefined) {
      const result = await changeUsername(env.USERS_KV, user, body.username as string);
      if (result === 'conflict') {
        return Response.json({ error: 'Username already taken' }, { status: 409 });
      }
      user = result;
    }

    const updated = await updateUser(env.USERS_KV, user, {
      displayName: body.displayName !== undefined ? (body.displayName as string | null) : undefined,
      isPublic: body.isPublic !== undefined ? (body.isPublic as boolean) : undefined,
    });

    return Response.json(toPublicProfile(updated));
  },
});
