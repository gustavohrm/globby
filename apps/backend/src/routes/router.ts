type RouteHandler = (request: Request) => Response | Promise<Response>;

type Route = {
  method: string;
  path: string;
  handler: RouteHandler;
};

export type RouteDefinition = Route;

class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler): void {
    this.routes.push({ method: method.toUpperCase(), path, handler });
  }

  match(method: string, path: string): RouteHandler | null {
    const route = this.routes.find(
      (r) => r.method === method.toUpperCase() && r.path === path,
    );
    return route?.handler ?? null;
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const handler = this.match(request.method, url.pathname);

    if (!handler) {
      return new Response("Not Found", { status: 404 });
    }

    return handler(request);
  }
}

const router = new Router();

export const register = (route: RouteDefinition): void => {
  router.add(route.method, route.path, route.handler);
};

export const handle = (request: Request) => router.handle(request);
