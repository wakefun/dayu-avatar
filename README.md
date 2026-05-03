# Dayu Avatar MVP

A mobile-first full-stack MVP for "大宇头像". Users log in through the Dayu unified login entry, upload personal and style reference images, create avatar generation tasks, watch progress, view generated results, save favorites to a gallery, and review queue and history data.

The repository remains mock-first by default, but now supports real runtime switches for both authentication and image generation:
- `AUTH_MODE=mock|oidc`
- `GENERATION_MODE=mock|openai`

SQLite and local files persist app state so the demo survives refreshes and restarts.

## Tech stack

- Monorepo: pnpm workspaces
- Frontend: React 19, TypeScript, Vite, React Router
- Backend: Express 5, TypeScript, `tsx`
- Persistence: SQLite via Node 24 built-in `node:sqlite`
- Uploads: `multer`
- Sessions: `express-session` with a SQLite-backed custom session store
- Mock image output: generated local PNG files via `pngjs`
- Real image output: OpenAI-compatible `/v1/images/edits` with uploaded reference images

## Directory structure

```text
.
├── apps/
│   ├── api/
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
├── .env.example
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

Use the root `.env.example` file as the reference for backend settings. Put local values in the repository root `.env` file.

The API auto-loads the root `.env` at startup, including when you run `pnpm dev` from the repository root.

Precedence rules:
- existing system environment variables win
- root `.env` fills in missing keys only
- if root `.env` is missing, or `AUTH_MODE` / `GENERATION_MODE` are unset, the API keeps its built-in mock defaults

Runtime keys used by the API:
- `PORT`: API port. Default `3001`.
- `WEB_ORIGIN`: frontend origin allowed by CORS and used for auth redirects. Default `http://localhost:5173`.
- `SESSION_SECRET`: secret used by `express-session`.
- `AUTH_MODE`: `mock` or `oidc`. Defaults to `mock`.
- `GENERATION_MODE`: `mock` or `openai`. Defaults to `mock`.

OpenAI-compatible generation keys:
- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL` default `gpt-image-2`
- `OPENAI_IMAGE_QUALITY` default `high`
- `OPENAI_REQUEST_TIMEOUT_MS` request/download timeout in milliseconds, default `600000` (10 minutes); invalid or non-positive values fall back to the default

OIDC login keys:
- `OIDC_DISCOVERY_URL`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_REDIRECT_URI`
- `OIDC_POST_LOGOUT_REDIRECT_URI`

Behavior summary:
- In `AUTH_MODE=mock`, clicking the login button creates a local mock session and redirects back into the app.
- In `AUTH_MODE=oidc`, the backend starts Authorization Code + PKCE, handles the callback, creates/updates the local user, stores only the app session plus `id_token` server-side for logout, and redirects back to the frontend root.
- In `GENERATION_MODE=mock`, task completion writes generated placeholder PNGs locally.
- In `GENERATION_MODE=openai`, task completion calls the configured OpenAI-compatible image edits endpoint with uploaded reference images and persists the returned image locally.

### Frontend

The web app does not require any Vite environment variables in this MVP.

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
2. Click `使用大宇统一登录`.
   - mock mode: local mock session is created
   - oidc mode: browser is redirected to the provider and then back to the app
3. On the generation page:
   - upload a personal reference image
   - upload an optional style reference image
   - enter a prompt
   - toggle style tags
   - submit a generation task
4. Move to the loading page and poll task progress.
5. View the generated result.
6. Save the result to the gallery, download it, or retry generation.
7. Review active and past tasks in queue and history.
8. Open settings to inspect the current user and log out.

The backend still seeds a few demo tasks after the first mock login for a new local user so queue/history states are easier to inspect.

## Data and storage locations

Runtime data is stored under the repo-local `data/` directory:

- SQLite database: `data/app.db`
- Uploaded references: `data/uploads/...`
- Generated images: `data/generated/...`

Public file URLs returned by the API use these routes:
- `/static/uploads/...`
- `/static/generated/...`

## API notes

The MVP backend exposes REST endpoints under `/api/**` for:
- auth session lookup, login start, callback, and logout
- uploads
- generation tasks and progress/result polling
- retry
- queue and history listing
- gallery list/save/favorite/delete/download

Response shapes are intentionally simple:
- single resource: `{ "task": ... }`, `{ "asset": ... }`, `{ "item": ... }`
- list: `{ "items": [...] }`
- error: `{ "error": { "code", "message" } }`

## Auth implementation notes

Implemented now:
- `GET /api/auth/me`
- `GET /api/auth/login`
- `GET /api/auth/callback`
- `POST /api/auth/mock-login`
- `POST /api/auth/logout`
- `GET /api/auth/logout/provider`

OIDC implementation scope for this MVP:
- discovery document fetch
- Authorization Code + PKCE
- state and nonce stored in server session
- token exchange
- ID token verification against provider JWKS for `RS256`, `ES256`, and `ES384`
- issuer, audience, expiration, issued-at, nonce, and subject validation
- local user/account upsert using verified provider `sub`
- optional provider logout redirect when discoverable

Non-goals still unchanged:
- no full token introspection
- no access token persistence
- no secret/token logging

## Generation implementation notes

Implemented now:
- mock generation path preserved
- OpenAI-compatible generation path added
- supports provider responses that contain either `b64_json` or `url`
- generated output is always persisted to local files and exposed through `/static/generated/...`
- OpenAI provider requests and provider-hosted image downloads both use `OPENAI_REQUEST_TIMEOUT_MS`, defaulting to 10 minutes

If a real generation call fails, the task is marked failed with `GENERATION_FAILED` and a safe message. Server logs include a sanitized provider status/error summary without API keys, bearer tokens, or signed image URLs.

For `GENERATION_MODE=openai`, first verify the deployment machine can reach `OPENAI_BASE_URL` over HTTPS. A task error such as `生成服务网络连接失败，请检查 Base URL、网络或代理配置` means the request did not receive an HTTP response from the provider; check DNS, TLS, firewall, and outbound proxy settings before changing prompts or model parameters.

## Security notes

- Do not expose `data/` as a single static root.
- Do not print API keys, ID tokens, or provider responses into logs.
- Session cookies remain HTTP-only.
- OIDC `id_token` is kept server-side only and used only for optional logout redirection.

## Current verification status

The codebase is intended to pass:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Mock mode can be smoke-tested locally without secrets.
Real OIDC and OpenAI modes require valid provider credentials and cannot be fully exercised without environment configuration.
