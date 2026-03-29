# Users & Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement anonymous user creation with KV storage, profile editing, and a public lobby endpoint on the Cloudflare Workers backend.

**Architecture:** Users are stored in Cloudflare Workers KV (`USERS_KV`) as JSON under `user:{uuid}`. A separate `lobby:users` index key holds an array of public user IDs for fast lobby reads. The worker's `Env` type is introduced and threaded through an extended `Router` that supports `:param` path segments.

**Tech Stack:** TypeScript, Cloudflare Workers, Cloudflare KV, Vitest, Wrangler

---

## File Map

| Action | Path                                              | Responsibility                                      |
| ------ | ------------------------------------------------- | --------------------------------------------------- |
| Modify | `wrangler.jsonc`                                  | Add `USERS_KV` KV namespace binding                 |
| Modify | `apps/backend/index.ts`                           | Introduce `Env` type, pass env to router            |
| Modify | `apps/backend/src/routes/router.ts`               | Add `:param` support, thread `env` through handlers |
| Modify | `apps/backend/src/routes/router.test.ts`          | Add tests for param extraction                      |
| Modify | `apps/backend/src/routes/index.ts`                | Register new routes                                 |
| Modify | `apps/backend/src/routes/v1/status/index.ts`      | Update handler signature for new `env` param        |
| Modify | `apps/backend/src/routes/v1/status/index.test.ts` | Update test for new handler signature               |
| Create | `apps/backend/src/modules/users/username.ts`      | Adjective+noun username generator                   |
| Create | `apps/backend/src/modules/users/user.ts`          | User type + KV read/write helpers                   |
| Create | `apps/backend/src/modules/users/auth.ts`          | Bearer secret extraction + validation               |
| Create | `apps/backend/src/modules/users/index.ts`         | Re-exports from the users module                    |
| Create | `apps/backend/src/routes/v1/users/index.ts`       | POST, GET, PATCH /api/v1/users/:id                  |
| Create | `apps/backend/src/routes/v1/users/index.test.ts`  | Tests for user routes                               |
| Create | `apps/backend/src/routes/v1/lobby/index.ts`       | GET /api/v1/lobby/users                             |
| Create | `apps/backend/src/routes/v1/lobby/index.test.ts`  | Tests for lobby route                               |

---

## Task 1: Extend Router with `:param` support and `env` threading

**Files:**

- Modify: `apps/backend/src/routes/router.ts`
- Modify: `apps/backend/src/routes/router.test.ts`
- Modify: `apps/backend/index.ts`

### Background

The current `Router` only does exact path matching and handlers receive only `(request: Request)`. We need:

1. Pattern matching for `:param` segments (e.g. `/api/v1/users/:id`)
2. Handlers to also receive `params` and `env` so route handlers can access KV

### Steps

- [ ] **Step 1.1: Write failing tests for param routing**

Replace the entire contents of `apps/backend/src/routes/router.test.ts` (existing tests are updated to pass `{}` as env, and new tests are added):

```ts
import { describe, it, expect } from "vitest";
import { register, handle } from "./router";

describe("Router", () => {
  it("matches a registered route", async () => {
    register({
      method: "GET",
      path: "/test",
      handler: () => new Response("hit"),
    });

    const response = await handle(new Request("http://localhost/test"), {});
    expect(await response.text()).toBe("hit");
  });

  it("returns 404 for unregistered paths", async () => {
    const response = await handle(new Request("http://localhost/missing"), {});
    expect(response.status).toBe(404);
  });

  it("distinguishes between methods", async () => {
    register({
      method: "GET",
      path: "/resource",
      handler: () => new Response("get"),
    });
    register({
      method: "POST",
      path: "/resource",
      handler: () => new Response("post"),
    });

    const get = await handle(new Request("http://localhost/resource"), {});
    expect(await get.text()).toBe("get");

    const post = await handle(new Request("http://localhost/resource", { method: "POST" }), {});
    expect(await post.text()).toBe("post");
  });

  it("extracts path parameters", async () => {
    register({
      method: "GET",
      path: "/users/:id",
      handler: (_req, params) => new Response(params.id),
    });

    const response = await handle(new Request("http://localhost/users/abc123"), {});
    expect(await response.text()).toBe("abc123");
  });

  it("does not match param route when segment count differs", async () => {
    register({
      method: "GET",
      path: "/items/:id",
      handler: () => new Response("hit"),
    });

    const response = await handle(new Request("http://localhost/items/abc/extra"), {});
    expect(response.status).toBe(404);
  });

  it("passes env to handler", async () => {
    register({
      method: "GET",
      path: "/env-test",
      handler: (_req, _params, env) => new Response((env as { VALUE: string }).VALUE),
    });

    const response = await handle(new Request("http://localhost/env-test"), { VALUE: "hello" });
    expect(await response.text()).toBe("hello");
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
npm run test -- --reporter=verbose apps/backend/src/routes/router.test.ts
```

Expected: new tests FAIL, existing tests PASS.

- [ ] **Step 1.3: Rewrite `router.ts` with param support and env threading**

Replace the entire contents of `apps/backend/src/routes/router.ts`:

```ts
type RouteHandler = (request: Request, params: Record<string, string>, env: object) => Response | Promise<Response>;

type Route = {
  method: string;
  path: string;
  handler: RouteHandler;
};

export type RouteDefinition = Route;

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

  match(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
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

export const handle = (request: Request, env: object) => router.handle(request, env);
```

- [ ] **Step 1.4: Update `apps/backend/index.ts` to introduce `Env` and pass it to the router**

Replace the entire contents of `apps/backend/index.ts`:

```ts
import { handle } from "./src/routes";

export interface Env {
  USERS_KV: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
```

- [ ] **Step 1.5: Update `apps/backend/src/routes/index.ts` to pass env through**

Replace the entire contents of `apps/backend/src/routes/index.ts`:

```ts
import "./v1/status";

export { handle } from "./router";
```

(No change needed here — `handle` already re-exports the updated router.)

- [ ] **Step 1.6: Update status route to match new handler signature**

Replace the entire contents of `apps/backend/src/routes/v1/status/index.ts`:

```ts
import { register } from "../../router";

register({
  method: "GET",
  path: "/api/v1/status",
  handler: () => Response.json({ status: "ok" }),
});
```

(No change needed — the handler ignores `params` and `env`, which is fine since TypeScript allows unused trailing args.)

- [ ] **Step 1.7: Update status route test to pass empty env**

Replace the entire contents of `apps/backend/src/routes/v1/status/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { handle } from "../../router";
import ".";

describe("status route", () => {
  it("responds to GET /api/v1/status with ok", async () => {
    const request = new Request("http://localhost/api/v1/status");
    const response = await handle(request, {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 1.8: Run all tests to verify everything passes**

```bash
npm run test
```

Expected: all tests PASS.

- [ ] **Step 1.9: Commit**

```bash
git add apps/backend/index.ts apps/backend/src/routes/router.ts apps/backend/src/routes/router.test.ts apps/backend/src/routes/index.ts apps/backend/src/routes/v1/status/index.ts apps/backend/src/routes/v1/status/index.test.ts
git commit -m "feat: extend router with :param support and env threading"
```

---

## Task 2: Add KV binding to wrangler config

**Files:**

- Modify: `wrangler.jsonc`

- [ ] **Step 2.1: Add `USERS_KV` namespace to `wrangler.jsonc`**

Replace the entire contents of `wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "globby",
  "main": "./apps/backend/index.ts",
  "compatibility_date": "2026-03-09",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*"],
  },
  "kv_namespaces": [
    {
      "binding": "USERS_KV",
      "id": "PLACEHOLDER_REPLACE_WITH_REAL_ID",
      "preview_id": "PLACEHOLDER_REPLACE_WITH_REAL_PREVIEW_ID",
    },
  ],
}
```

> **Note:** The `id` and `preview_id` values are placeholders. For `preview:local` (local dev without a Cloudflare account), Wrangler uses a local KV simulation and ignores these values. For deploying to Cloudflare, run `npx wrangler kv namespace create USERS_KV` and replace the placeholder with the returned ID.

- [ ] **Step 2.2: Commit**

```bash
git add wrangler.jsonc
git commit -m "feat: add USERS_KV KV namespace binding"
```

---

## Task 3: Username generator

**Files:**

- Create: `apps/backend/src/modules/users/username.ts`

### Background

Generates a random adjective+noun username (e.g. `SilentOtter`). No external dependency. Uses a built-in word list. On collision (username already taken), the caller retries — the generator itself is pure and stateless.

### Steps

- [ ] **Step 3.1: Create `username.ts`**

Create `apps/backend/src/modules/users/username.ts`:

```ts
const ADJECTIVES = [
  "Silent",
  "Swift",
  "Brave",
  "Calm",
  "Dark",
  "Bright",
  "Wild",
  "Gentle",
  "Bold",
  "Clever",
  "Eager",
  "Fierce",
  "Glad",
  "Happy",
  "Icy",
  "Jolly",
  "Kind",
  "Lively",
  "Merry",
  "Noble",
  "Odd",
  "Proud",
  "Quick",
  "Rare",
  "Shy",
  "Tame",
  "Unique",
  "Vivid",
  "Warm",
  "Zany",
  "Ancient",
  "Blunt",
  "Crisp",
  "Daring",
  "Earnest",
  "Frosty",
  "Graceful",
  "Hollow",
  "Ironclad",
  "Jagged",
  "Keen",
  "Lunar",
  "Mystic",
  "Nimble",
  "Oblique",
  "Placid",
  "Quiet",
  "Rustic",
  "Stormy",
  "Tidy",
];

const NOUNS = [
  "Otter",
  "Fox",
  "Wolf",
  "Bear",
  "Hawk",
  "Raven",
  "Lynx",
  "Falcon",
  "Panda",
  "Tiger",
  "Crane",
  "Viper",
  "Moose",
  "Bison",
  "Heron",
  "Cobra",
  "Drake",
  "Eagle",
  "Finch",
  "Goose",
  "Hyena",
  "Ibis",
  "Jackal",
  "Kite",
  "Lemur",
  "Mink",
  "Newt",
  "Owl",
  "Puma",
  "Quail",
  "Robin",
  "Stoat",
  "Toad",
  "Urial",
  "Vole",
  "Wren",
  "Xerus",
  "Yak",
  "Zebra",
  "Adder",
  "Bison",
  "Coral",
  "Dingo",
  "Egret",
  "Ferret",
  "Gecko",
  "Hound",
  "Iguana",
  "Jaguar",
  "Koala",
];

function randomItem(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateUsername(): string {
  return randomItem(ADJECTIVES) + randomItem(NOUNS);
}

export function generateUsernameWithSuffix(): string {
  const suffix = Math.floor(Math.random() * 90 + 10).toString();
  return randomItem(ADJECTIVES) + randomItem(NOUNS) + suffix;
}
```

> Note: `generateUsername` is used on first attempt. `generateUsernameWithSuffix` is used as fallback when a plain name is already taken. The KV helpers in Task 4 handle the retry logic.

- [ ] **Step 3.2: Commit**

```bash
git add apps/backend/src/modules/users/username.ts
git commit -m "feat: add adjective+noun username generator"
```

---

## Task 4: User type and KV helpers

**Files:**

- Create: `apps/backend/src/modules/users/user.ts`

### Background

Defines the `User` type and all KV read/write operations. Handlers import these helpers rather than calling KV directly. The `KVNamespace` type is available globally in the Workers runtime — no import needed.

### Steps

- [ ] **Step 4.1: Create `user.ts`**

Create `apps/backend/src/modules/users/user.ts`:

```ts
import { generateUsername, generateUsernameWithSuffix } from "./username";

export type User = {
  id: string;
  username: string;
  displayName: string | null;
  secret: string;
  isPublic: boolean;
  createdAt: string;
};

export type PublicUser = Pick<User, "id" | "username" | "displayName">;

function userKey(id: string): string {
  return `user:${id}`;
}

const LOBBY_KEY = "lobby:users";

export async function getUser(kv: KVNamespace, id: string): Promise<User | null> {
  const raw = await kv.get(userKey(id));
  if (!raw) return null;
  return JSON.parse(raw) as User;
}

export async function putUser(kv: KVNamespace, user: User): Promise<void> {
  await kv.put(userKey(user.id), JSON.stringify(user));
}

export async function createUser(kv: KVNamespace): Promise<User> {
  const id = crypto.randomUUID();
  const secret = crypto.randomUUID();

  // Try plain username first, fall back to suffixed on collision
  let username = generateUsername();
  const existing = await kv.get(`username:${username}`);
  if (existing) {
    username = generateUsernameWithSuffix();
  }

  const user: User = {
    id,
    username,
    displayName: null,
    secret,
    isPublic: false,
    createdAt: new Date().toISOString(),
  };

  await kv.put(userKey(id), JSON.stringify(user));
  await kv.put(`username:${username}`, id);

  return user;
}

export async function updateUser(
  kv: KVNamespace,
  user: User,
  patch: { displayName?: string | null; isPublic?: boolean },
): Promise<User> {
  const wasPublic = user.isPublic;
  const updated: User = {
    ...user,
    ...(patch.displayName !== undefined && { displayName: patch.displayName }),
    ...(patch.isPublic !== undefined && { isPublic: patch.isPublic }),
  };

  await kv.put(userKey(updated.id), JSON.stringify(updated));

  // Update lobby index if isPublic changed
  if (patch.isPublic !== undefined && patch.isPublic !== wasPublic) {
    const raw = await kv.get(LOBBY_KEY);
    const index: string[] = raw ? (JSON.parse(raw) as string[]) : [];

    const newIndex = patch.isPublic ? [...index, updated.id] : index.filter((uid) => uid !== updated.id);

    await kv.put(LOBBY_KEY, JSON.stringify(newIndex));
  }

  return updated;
}

export async function getLobbyUsers(kv: KVNamespace): Promise<PublicUser[]> {
  const raw = await kv.get(LOBBY_KEY);
  if (!raw) return [];

  const ids = JSON.parse(raw) as string[];
  const users = await Promise.all(ids.map((id) => getUser(kv, id)));

  return users
    .filter((u): u is User => u !== null)
    .map(({ id, username, displayName }) => ({ id, username, displayName }));
}

export function toPublicProfile(user: User): Pick<User, "id" | "username" | "displayName" | "isPublic"> {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isPublic: user.isPublic,
  };
}
```

- [ ] **Step 4.2: Commit**

```bash
git add apps/backend/src/modules/users/user.ts
git commit -m "feat: add User type and KV read/write helpers"
```

---

## Task 5: Auth helper

**Files:**

- Create: `apps/backend/src/modules/users/auth.ts`

### Steps

- [ ] **Step 5.1: Create `auth.ts`**

Create `apps/backend/src/modules/users/auth.ts`:

```ts
export function extractBearer(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}
```

- [ ] **Step 5.2: Commit**

```bash
git add apps/backend/src/modules/users/auth.ts
git commit -m "feat: add Bearer token extraction helper"
```

---

## Task 6: Users module index

**Files:**

- Create: `apps/backend/src/modules/users/index.ts`

- [ ] **Step 6.1: Create `index.ts`**

Create `apps/backend/src/modules/users/index.ts`:

```ts
export type { User, PublicUser } from "./user";
export { getUser, putUser, createUser, updateUser, getLobbyUsers, toPublicProfile } from "./user";
export { generateUsername, generateUsernameWithSuffix } from "./username";
export { extractBearer } from "./auth";
```

- [ ] **Step 6.2: Commit**

```bash
git add apps/backend/src/modules/users/index.ts
git commit -m "feat: add users module index"
```

---

## Task 7: User routes

**Files:**

- Create: `apps/backend/src/routes/v1/users/index.ts`
- Create: `apps/backend/src/routes/v1/users/index.test.ts`
- Modify: `apps/backend/src/routes/index.ts`

### Background

Three routes:

- `POST /api/v1/users` — create a user, return `id`, `username`, `secret`
- `GET /api/v1/users/:id` — return public profile (no secret)
- `PATCH /api/v1/users/:id` — update `displayName` / `isPublic`, requires Bearer auth

### Steps

- [ ] **Step 7.1: Write failing tests**

Create `apps/backend/src/routes/v1/users/index.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { handle } from "../../../router";
import "./index";
import type { Env } from "../../../../../index";

// Minimal KV mock backed by a Map
function makeMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

function makeEnv(kv: KVNamespace): Env {
  return { USERS_KV: kv };
}

describe("POST /api/v1/users", () => {
  it("creates a user and returns id, username, secret", async () => {
    const kv = makeMockKV();
    const res = await handle(new Request("http://localhost/api/v1/users", { method: "POST" }), makeEnv(kv));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; username: string; secret: string };
    expect(typeof body.id).toBe("string");
    expect(typeof body.username).toBe("string");
    expect(typeof body.secret).toBe("string");
  });
});

describe("GET /api/v1/users/:id", () => {
  it("returns public profile for existing user", async () => {
    const kv = makeMockKV();
    // Create a user first
    const createRes = await handle(new Request("http://localhost/api/v1/users", { method: "POST" }), makeEnv(kv));
    const { id } = (await createRes.json()) as { id: string };

    const res = await handle(new Request(`http://localhost/api/v1/users/${id}`), makeEnv(kv));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(id);
    expect(body).not.toHaveProperty("secret");
  });

  it("returns 404 for unknown user", async () => {
    const kv = makeMockKV();
    const res = await handle(new Request("http://localhost/api/v1/users/nonexistent"), makeEnv(kv));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
  });
});

describe("PATCH /api/v1/users/:id", () => {
  it("updates displayName and isPublic with correct secret", async () => {
    const kv = makeMockKV();
    const createRes = await handle(new Request("http://localhost/api/v1/users", { method: "POST" }), makeEnv(kv));
    const { id, secret } = (await createRes.json()) as { id: string; secret: string };

    const res = await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ displayName: "Alice", isPublic: true }),
      }),
      makeEnv(kv),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.displayName).toBe("Alice");
    expect(body.isPublic).toBe(true);
    expect(body).not.toHaveProperty("secret");
  });

  it("returns 401 with missing Authorization header", async () => {
    const kv = makeMockKV();
    const createRes = await handle(new Request("http://localhost/api/v1/users", { method: "POST" }), makeEnv(kv));
    const { id } = (await createRes.json()) as { id: string };

    const res = await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Alice" }),
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 with wrong secret", async () => {
    const kv = makeMockKV();
    const createRes = await handle(new Request("http://localhost/api/v1/users", { method: "POST" }), makeEnv(kv));
    const { id } = (await createRes.json()) as { id: string };

    const res = await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-secret",
        },
        body: JSON.stringify({ displayName: "Alice" }),
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 for unknown user", async () => {
    const kv = makeMockKV();
    const res = await handle(
      new Request("http://localhost/api/v1/users/nonexistent", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer any-secret",
        },
        body: JSON.stringify({ displayName: "Alice" }),
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    const kv = makeMockKV();
    const createRes = await handle(new Request("http://localhost/api/v1/users", { method: "POST" }), makeEnv(kv));
    const { id, secret } = (await createRes.json()) as { id: string; secret: string };

    const res = await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: "not json",
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request body" });
  });
});
```

- [ ] **Step 7.2: Run tests to verify they fail**

```bash
npm run test -- --reporter=verbose apps/backend/src/routes/v1/users/index.test.ts
```

Expected: all tests FAIL (route file does not exist yet).

- [ ] **Step 7.3: Create the user routes**

Create `apps/backend/src/routes/v1/users/index.ts`:

```ts
import { register } from "../../../router";
import { createUser, getUser, updateUser, toPublicProfile, extractBearer } from "../../../../modules/users";
import type { Env } from "../../../../../index";

register({
  method: "POST",
  path: "/api/v1/users",
  handler: async (_req, _params, env) => {
    const { USERS_KV } = env as Env;
    const user = await createUser(USERS_KV);
    return Response.json({ id: user.id, username: user.username, secret: user.secret }, { status: 201 });
  },
});

register({
  method: "GET",
  path: "/api/v1/users/:id",
  handler: async (_req, params, env) => {
    const { USERS_KV } = env as Env;
    const user = await getUser(USERS_KV, params.id);
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });
    return Response.json(toPublicProfile(user));
  },
});

register({
  method: "PATCH",
  path: "/api/v1/users/:id",
  handler: async (req, params, env) => {
    const { USERS_KV } = env as Env;

    const secret = extractBearer(req);
    if (!secret) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getUser(USERS_KV, params.id);
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    if (user.secret !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { displayName?: unknown; isPublic?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (
      (body.displayName !== undefined && body.displayName !== null && typeof body.displayName !== "string") ||
      (body.isPublic !== undefined && typeof body.isPublic !== "boolean")
    ) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const updated = await updateUser(USERS_KV, user, {
      displayName: body.displayName !== undefined ? (body.displayName as string | null) : undefined,
      isPublic: body.isPublic !== undefined ? (body.isPublic as boolean) : undefined,
    });

    return Response.json(toPublicProfile(updated));
  },
});
```

- [ ] **Step 7.4: Register user routes in `apps/backend/src/routes/index.ts`**

Replace the entire contents of `apps/backend/src/routes/index.ts`:

```ts
import "./v1/status";
import "./v1/users";

export { handle } from "./router";
```

- [ ] **Step 7.5: Run tests to verify they pass**

```bash
npm run test -- --reporter=verbose apps/backend/src/routes/v1/users/index.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7.6: Run all tests to verify nothing is broken**

```bash
npm run test
```

Expected: all tests PASS.

- [ ] **Step 7.7: Commit**

```bash
git add apps/backend/src/routes/v1/users/index.ts apps/backend/src/routes/v1/users/index.test.ts apps/backend/src/routes/index.ts
git commit -m "feat: add user creation, profile, and update routes"
```

---

## Task 8: Lobby users route

**Files:**

- Create: `apps/backend/src/routes/v1/lobby/index.ts`
- Create: `apps/backend/src/routes/v1/lobby/index.test.ts`
- Modify: `apps/backend/src/routes/index.ts`

### Steps

- [ ] **Step 8.1: Write failing tests**

Create `apps/backend/src/routes/v1/lobby/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { handle } from "../../../router";
import "../users/index"; // registers POST/PATCH /api/v1/users routes needed by tests
import "./index";
import type { Env } from "../../../../../index";

function makeMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

function makeEnv(kv: KVNamespace): Env {
  return { USERS_KV: kv };
}

describe("GET /api/v1/lobby/users", () => {
  it("returns empty array when no public users exist", async () => {
    const kv = makeMockKV();
    const res = await handle(new Request("http://localhost/api/v1/lobby/users"), makeEnv(kv));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [] });
  });

  it("returns public users after one opts in", async () => {
    const kv = makeMockKV();

    // Create a user
    const createRes = await handle(new Request("http://localhost/api/v1/users", { method: "POST" }), makeEnv(kv));
    const { id, secret } = (await createRes.json()) as { id: string; secret: string };

    // Make them public
    await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ isPublic: true }),
      }),
      makeEnv(kv),
    );

    const res = await handle(new Request("http://localhost/api/v1/lobby/users"), makeEnv(kv));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Array<{ id: string }> };
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe(id);
    expect(body.users[0]).not.toHaveProperty("secret");
    expect(body.users[0]).not.toHaveProperty("isPublic");
  });

  it("removes user from lobby when they set isPublic to false", async () => {
    const kv = makeMockKV();

    const createRes = await handle(new Request("http://localhost/api/v1/users", { method: "POST" }), makeEnv(kv));
    const { id, secret } = (await createRes.json()) as { id: string; secret: string };

    // Make public
    await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ isPublic: true }),
      }),
      makeEnv(kv),
    );

    // Make private again
    await handle(
      new Request(`http://localhost/api/v1/users/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ isPublic: false }),
      }),
      makeEnv(kv),
    );

    const res = await handle(new Request("http://localhost/api/v1/lobby/users"), makeEnv(kv));
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users).toHaveLength(0);
  });
});
```

- [ ] **Step 8.2: Run tests to verify they fail**

```bash
npm run test -- --reporter=verbose apps/backend/src/routes/v1/lobby/index.test.ts
```

Expected: all tests FAIL.

- [ ] **Step 8.3: Create the lobby route**

Create `apps/backend/src/routes/v1/lobby/index.ts`:

```ts
import { register } from "../../../router";
import { getLobbyUsers } from "../../../../modules/users";
import type { Env } from "../../../../../index";

register({
  method: "GET",
  path: "/api/v1/lobby/users",
  handler: async (_req, _params, env) => {
    const { USERS_KV } = env as Env;
    const users = await getLobbyUsers(USERS_KV);
    return Response.json({ users });
  },
});
```

- [ ] **Step 8.4: Register lobby route in `apps/backend/src/routes/index.ts`**

Replace the entire contents of `apps/backend/src/routes/index.ts`:

```ts
import "./v1/status";
import "./v1/users";
import "./v1/lobby";

export { handle } from "./router";
```

- [ ] **Step 8.5: Run tests to verify they pass**

```bash
npm run test -- --reporter=verbose apps/backend/src/routes/v1/lobby/index.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8.6: Run all tests**

```bash
npm run test
```

Expected: all tests PASS.

- [ ] **Step 8.7: Commit**

```bash
git add apps/backend/src/routes/v1/lobby/index.ts apps/backend/src/routes/v1/lobby/index.test.ts apps/backend/src/routes/index.ts
git commit -m "feat: add lobby users endpoint"
```

---

## Task 9: Final check

- [ ] **Step 9.1: Run full test suite**

```bash
npm run test
```

Expected: all tests PASS.

- [ ] **Step 9.2: Run lint check**

```bash
npm run lint:check
```

If it reports issues, fix them with:

```bash
npm run lint:fix
```

Then commit:

```bash
git add -A
git commit -m "style: fix formatting"
```
