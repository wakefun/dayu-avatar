# Dayu Avatar MVP

A mobile-first full-stack MVP for "大宇头像". Users log in through a mock "大宇统一登录" entry, upload personal and style reference images, create avatar generation tasks, watch mock progress, view generated results, save favorites to a gallery, and review queue and history data.

This repository is intentionally mock-first:
- OAuth is represented by a mock login flow today.
- Image generation is represented by a local mock pipeline today.
- SQLite and local files persist app state so the demo survives refreshes and restarts.

## Tech stack

- Monorepo: pnpm workspaces
- Frontend: React 19, TypeScript, Vite, React Router
- Backend: Express 5, TypeScript, `tsx`
- Persistence: SQLite via Node 24 built-in `node:sqlite`
- Uploads: `multer`
- Sessions: `express-session` with a SQLite-backed custom session store
- Mock image output: generated local PNG files via `pngjs`

## Directory structure

```text
.
├── apps/
│   ├── api/
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── src/index.ts
│   └── web/
│       ├── package.json
│       ├── index.html
│       └── src/
├── data/
│   ├── app.db
│   ├── generated/
│   └── uploads/
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Notes:
- `data/` is created locally at runtime and is git-ignored.
- The backend serves only `data/uploads` and `data/generated` through `/static/...` routes. It does not expose the full `data/` directory.

## Prerequisites

- Node.js 24 or newer
- pnpm 10 or newer

## Install

From the repository root:

```bash
pnpm install
```

## Environment variables

### Backend

The repository includes `apps/api/.env.example` as a reference file for backend settings.

Important: the current API runtime reads values from `process.env`, but the existing `pnpm dev` script does not auto-load `apps/api/.env`.

That means you can either:
- rely on the built-in local defaults already present in `apps/api/src/index.ts`, or
- export the variables in your shell before running `pnpm dev`

Current runtime keys actually used by the API:
- `PORT`: API port. Default local value is `3001`.
- `WEB_ORIGIN`: frontend origin allowed by CORS. Default local value is `http://localhost:5173`.
- `SESSION_SECRET`: secret used by `express-session`.

Documented placeholder keys for future integrations:
- `AUTH_MODE`: reserved placeholder for future auth mode switching. The current MVP only implements mock login.
- `GENERATION_MODE`: reserved placeholder for future generation provider switching. The current MVP only implements mock generation.
- `OPENAI_*`: placeholders for a future OpenAI-compatible image generation integration.
- `OIDC_*`: placeholders for a future real Dayu/OIDC login integration.

The current code does not implement real OIDC or real OpenAI image generation yet. Those variables are documented now so the future integration points are visible without implying they are active today.

### Frontend

The web app does not currently require any Vite environment variables, so no frontend `.env.example` is needed at this stage.

## Development

Start both apps from the repo root:

```bash
pnpm dev
```

This runs:
- Web app: `http://localhost:5173`
- API server: `http://localhost:3001`

Vite proxies `/api` and `/static` requests to the API during local development.

## Verification commands

Run from the repository root:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Core MVP flow

1. Open the app and land on `/login`.
2. Click `使用大宇统一登录` to create a local mock session.
3. On the generation page:
   - upload a personal reference image
   - upload an optional style reference image
   - enter a prompt
   - toggle style tags
   - submit a generation task
4. Move to the loading page and poll mock task progress.
5. View the generated result.
6. Save the result to the gallery, download it, or retry generation.
7. Review active and past tasks in queue and history.
8. Open settings to inspect the current mock user and log out.

The backend seeds a few demo tasks after the first mock login for a new local user so queue/history states are easier to inspect.

## Data and storage locations

Runtime data is stored under the repo-local `data/` directory:

- SQLite database: `data/app.db`
- Uploaded references: `data/uploads/...`
- Generated mock images: `data/generated/...`

Public file URLs returned by the API use these routes:
- `/static/uploads/...`
- `/static/generated/...`

## API notes

The MVP backend exposes REST endpoints under `/api/**` for:
- auth session lookup and mock login/logout
- uploads
- generation tasks and progress/result polling
- retry
- queue and history listing
- gallery list/save/favorite/delete/download

Response shapes are intentionally simple:
- single resource: `{ "task": ... }`, `{ "asset": ... }`, `{ "item": ... }`
- list: `{ "items": [...] }`
- error: `{ "error": { "code", "message" } }`

## Mock-first implementation notes

Current implementation status:
- Mock login: implemented
- Mock generation progress and result creation: implemented
- SQLite persistence: implemented
- Local file upload and static file serving: implemented
- Real OIDC login: not implemented yet
- Real OpenAI-compatible image generation: not implemented yet

That means this repository is suitable for local MVP demos and contract validation, while preserving clear configuration placeholders for future auth and generation upgrades.
