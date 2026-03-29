# AGENTS.md

Codebase reference for AI agents working in this repository.

## Project Overview

Globby is a free, open-source, anonymous, end-to-end encrypted messaging app. The server acts as a relay only — messages are stored on the recipient's device, not on the server. No authentication required.

## Stack

- **Frontend:** Vanilla TypeScript, Web Components, TailwindCSS v4, Vite
- **Backend:** TypeScript on Cloudflare Workers, Cloudflare Durable Objects (planned), Cloudflare KV
- **Tests:** Vitest
- **Formatter:** Prettier (with `prettier-plugin-tailwindcss`)
- **Deploy:** Wrangler (unified frontend + backend deployment)

## Commands

```bash
npm run dev               # Vite dev server for frontend only (port 5173)
npm run preview           # Build frontend + wrangler dev (full stack)
npm run preview:local     # Full stack, local mode (no Cloudflare account needed)
npm run build             # Build frontend (outputs to /dist)
npm run test              # Run tests once
npm run test:watch        # Run tests in watch mode
npm run lint:check        # Check formatting
npm run lint:fix          # Auto-fix formatting
```

## Structure

```
.docs/                           # Centralized documentation
  plans/                         # Implementation & action plans
  specs/                         # Technical & implementation specifications
apps/
  backend/
    index.ts                     # Worker entry point; exports Env interface and fetch handler
    src/
      routes/
        router.ts                # Custom Router class (:param support, env threading, clearRoutes)
        index.ts                 # Route registration
        v1/
          status/index.ts        # GET /api/v1/status
          users/index.ts         # POST /api/v1/users, GET/PATCH /api/v1/users/:id
          lobby/index.ts         # GET /api/v1/lobby/users
          rooms/                 # Reserved for messaging endpoints
      modules/
        users/
          index.ts               # Re-exports: User, PublicUser, LobbyUser, KV helpers, auth
          user.ts                # User/PublicUser/LobbyUser types + KV helpers (getUser, createUser, updateUser, getLobbyUsers, toPublicProfile)
          username.ts            # Adjective+noun username generator
          auth.ts                # extractBearer() — Bearer token extraction
  frontend/
    index.html                   # Main page
    settings/index.html          # Settings page
    _public/                     # Static assets (favicon, robots.txt)
    _ui/
      components/                # Web Components (app-shell, app-nav, app-input, app-toggle)
      scripts/index.ts           # Global scripts
      styles/                    # index.css, theme.css, components.css
dist/                            # Frontend build output (gitignored, served as static assets)
wrangler.example.jsonc             # Template for deployment config (copy to wrangler.jsonc, gitignored)
```

## Routing

**Frontend:** No router framework. Three nav tabs in `app-nav`: `/` (home), `/chat/`, `/settings/`. Active route detected via `window.location.pathname`.

**Backend:** Custom `Router` class in `apps/backend/src/routes/router.ts`. Supports `:param` path segments (e.g. `/users/:id`). Handlers receive `(request, params, env)`. Call `clearRoutes()` in `beforeEach` for test isolation and re-register routes manually. Routes registered in `apps/backend/src/routes/index.ts`. All API routes are under `/api/v1/`.

**Deployment routing:** Wrangler serves the Worker for `/api/*` paths first, then falls back to the KV asset handler for static files (frontend build).

## Frontend Components

Web Components registered in `_ui/components/index.ts`:

- `app-shell` — main layout wrapper
- `app-nav` — bottom navigation bar
- `app-input` — labeled form input
- `app-toggle` — toggle switch

Components re-render on observed attribute changes and dispatch events upward.

## Backend Conventions

- Route handlers return `Response` objects
- Handlers are typed with `register<Env>(...)` so `env.USERS_KV` is available without casting
- Tests are co-located with implementation (`*.test.ts` next to `*.ts`)
- Vitest only covers `apps/backend/**/*.test.ts`
- No unused locals/parameters (enforced by `tsconfig.json`)
- KV is accessed via helpers in `modules/users/` — handlers never call `kv` directly
- Mock KV in tests: use a `Map`-backed object implementing `get`, `put`, `delete`, `list`; cast with `as unknown as KVNamespace`

## Users & Auth

- Users are anonymous — no sign-up, no login
- Created via `POST /api/v1/users` → returns `{ id, username, secret }`; client stores the secret
- Auth on mutating endpoints: `Authorization: Bearer <secret>` header; validated by `extractBearer()` + comparing against stored `user.secret`
- Profiles are private by default (`isPublic: false`); users opt in to appear in the lobby

## KV Schema

| Key                   | Value           | Description                       |
| --------------------- | --------------- | --------------------------------- |
| `user:{uuid}`         | `User` JSON     | Full user record including secret |
| `username:{username}` | user ID         | Username uniqueness index         |
| `lobby:users`         | `string[]` JSON | Array of public user IDs          |

## Deployment

- Local dev (`preview:local`): no Cloudflare account needed, KV is simulated
- Production: copy `wrangler.example.jsonc` → `wrangler.jsonc` (gitignored), fill in real KV namespace IDs from `npx wrangler kv namespace create USERS_KV`, deploy with `wrangler deploy`

## TypeScript Config

- Target: ESNext, strict mode, module resolution: bundler
- Type-check only (no emit) — Vite and Wrangler handle compilation
- Includes: `apps/`, `vite.config.ts`
