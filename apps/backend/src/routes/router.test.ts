import { describe, it, expect, beforeEach } from 'vitest';
import { register, handle, clearRoutes } from './router';

beforeEach(() => {
  clearRoutes();
});

describe('Router', () => {
  it('matches a registered route', async () => {
    register({
      method: 'GET',
      path: '/test',
      handler: () => new Response('hit'),
    });

    const response = await handle(new Request('http://localhost/test'), {});
    expect(await response.text()).toBe('hit');
  });

  it('returns 404 for unregistered paths', async () => {
    const response = await handle(new Request('http://localhost/missing'), {});
    expect(response.status).toBe(404);
  });

  it('distinguishes between methods', async () => {
    register({
      method: 'GET',
      path: '/resource',
      handler: () => new Response('get'),
    });
    register({
      method: 'POST',
      path: '/resource',
      handler: () => new Response('post'),
    });

    const get = await handle(new Request('http://localhost/resource'), {});
    expect(await get.text()).toBe('get');

    const post = await handle(new Request('http://localhost/resource', { method: 'POST' }), {});
    expect(await post.text()).toBe('post');
  });

  it('extracts path parameters', async () => {
    register({
      method: 'GET',
      path: '/users/:id',
      handler: (_req, params) => new Response(params.id),
    });

    const response = await handle(new Request('http://localhost/users/abc123'), {});
    expect(await response.text()).toBe('abc123');
  });

  it('does not match param route when segment count differs', async () => {
    register({
      method: 'GET',
      path: '/items/:id',
      handler: () => new Response('hit'),
    });

    const response = await handle(new Request('http://localhost/items/abc/extra'), {});
    expect(response.status).toBe(404);
  });

  it('passes env to handler', async () => {
    register<{ VALUE: string }>({
      method: 'GET',
      path: '/env-test',
      handler: (_req, _params, env) => new Response(env.VALUE),
    });

    const response = await handle(new Request('http://localhost/env-test'), { VALUE: 'hello' });
    expect(await response.text()).toBe('hello');
  });
});
