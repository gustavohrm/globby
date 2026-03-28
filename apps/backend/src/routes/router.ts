type RouteHandler = (
  request: Request,
  params: Record<string, string>,
  env: object,
) => Response | Promise<Response>;

type Route = {
  method: string;
  path: string;
  handler: RouteHandler;
};

export type RouteDefinition = Route;

function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
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

  match(
    method: string,
    pathname: string,
  ): { handler: RouteHandler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      const params = matchPath(route.path, pathname);
      if (params !== null) return { handler: route.handler, params };
    }
    return null;
  }

  async handle(request: Request, env: object): Promise<Response> {
    const url = new URL(request.url);
    const match = this.match(request.method, url.pathname);

    if (!match) {
      return new Response("Not Found", { status: 404 });
    }

    return match.handler(request, match.params, env);
  }
}

const router = new Router();

export const register = (route: RouteDefinition): void => {
  router.add(route.method, route.path, route.handler);
};

export const handle = (request: Request, env: object) =>
  router.handle(request, env);
