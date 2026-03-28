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
apps/
  backend/
    index.ts                     # Worker entry point (exports fetch handler)
    src/
      routes/
        router.ts                # Custom Router class (method + exact path matching)
        index.ts                 # Route registration
        v1/
          status/index.ts        # GET /api/v1/status
          rooms/                 # Reserved for messaging endpoints
      modules/                   # Reserved for shared backend logic
  frontend/
    index.html                   # Main page
    settings/index.html          # Settings page
    _public/                     # Static assets (favicon, robots.txt)
    _ui/
      components/                # Web Components (app-shell, app-nav, app-input, app-toggle)
      scripts/index.ts           # Global scripts
      styles/                    # index.css, theme.css, components.css
dist/                            # Frontend build output (gitignored, served as static assets)
```

## Routing

**Frontend:** No router framework. Three nav tabs in `app-nav`: `/` (home), `/chat/`, `/settings/`. Active route detected via `window.location.pathname`.

**Backend:** Custom `Router` class in `apps/backend/src/routes/router.ts`. Matches by HTTP method + exact path. Routes registered in `apps/backend/src/routes/index.ts`. All API routes are under `/api/v1/`.

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
- Tests are co-located with implementation (`*.test.ts` next to `*.ts`)
- Vitest only covers `apps/backend/**/*.test.ts`
- No unused locals/parameters (enforced by `tsconfig.json`)

## TypeScript Config

- Target: ESNext, strict mode, module resolution: bundler
- Type-check only (no emit) — Vite and Wrangler handle compilation
- Includes: `apps/`, `vite.config.ts`
