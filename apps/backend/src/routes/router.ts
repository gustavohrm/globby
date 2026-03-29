type RouteHandler<E extends object = object> = (
  request: Request,
  params: Record<string, string>,
  env: E,
) => Response | Promise<Response>;

type Route<E extends object = object> = {
  method: string;
  path: string;
  handler: RouteHandler<E>;
};

export type RouteDefinition<E extends object = object> = Route<E>;

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    const v = pathParts[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = v;
    } else if (p !== v) {
      return null;
    }
  }

  return params;
}

class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler): void {
    this.routes.push({ method: method.toUpperCase(), path, handler });
  }

  clear(): void {
    this.routes = [];
  }

  match(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      const params = matchPath(route.path, pathname);
      if (params !== null) return { handler: route.handler, params };
    }
    return null;
  }

  async handle<E extends object>(request: Request, env: E): Promise<Response> {
    const url = new URL(request.url);
    const match = this.match(request.method, url.pathname);

    if (!match) {
      return new Response("Not Found", { status: 404 });
    }

    return match.handler(request, match.params, env);
  }
}

const router = new Router();

export const register = <E extends object = object>(route: RouteDefinition<E>): void => {
  router.add(route.method, route.path, route.handler as RouteHandler);
};

export const clearRoutes = (): void => router.clear();

export const handle = <E extends object = object>(request: Request, env: E): Promise<Response> =>
  router.handle(request, env);
