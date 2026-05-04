# Research: fullstack-stack

- **Query**: Research a pragmatic MVP stack for a mobile-first AI avatar web app in a monorepo with React frontend, Node.js backend, SQLite, local file uploads, and mockable OAuth/OpenAI image generation. Focus on low-friction dependencies and scripts suitable for a brand-new project.
- **Scope**: mixed
- **Date**: 2026-05-02

## Findings

### Files Found

| File Path | Description |
|---|---|
| `need.md` | Product and technical direction for the MVP, including monorepo, React, Node.js, SQLite, local file storage, OAuth, and OpenAI image generation requirements. |
| `.trellis/tasks/05-02-dayu-avatar-mvp/task.json` | Active Trellis task metadata showing this work is still in planning status. |
| `.trellis/spec/backend/index.md` | Backend spec index; currently placeholder guidance only. |
| `.trellis/spec/backend/database-guidelines.md` | Placeholder database conventions doc; no concrete DB stack chosen yet. |
| `.trellis/spec/backend/directory-structure.md` | Placeholder backend layout doc; no concrete module layout chosen yet. |
| `.trellis/spec/frontend/index.md` | Frontend spec index; currently placeholder guidance only. |

### Code Patterns

There are no application code patterns to mirror yet; the repository is still in planning and documentation setup.

Relevant local constraints:

- The product brief explicitly calls for a monorepo with React frontend, Node.js backend, SQLite, local image storage, and OpenAI-compatible image generation via `/v1/images/generations` using `gpt-image-2` with default `high` quality. See `need.md:47-57`.
- Login is OAuth-based, with a provided OIDC discovery endpoint and a stated allowance that the login flow may be mocked first. See `need.md:60-77` and `need.md:285-299`.
- The core avatar flow is expected to work in mock mode first: upload references, create task, show loading, return mock result, save to gallery, and view tasks/history. See `need.md:266-281`.
- The active Trellis task is still in `planning` state. See `.trellis/tasks/05-02-dayu-avatar-mvp/task.json:0-24`.
- Existing backend/frontend spec files are templates and do not yet impose concrete implementation conventions. See `.trellis/spec/backend/index.md:8-20`, `.trellis/spec/backend/database-guidelines.md:8-18`, and `.trellis/spec/frontend/index.md:8-21`.

### Recommended MVP Stack

| Area | Recommendation | Why it fits this MVP |
|---|---|---|
| Package manager / workspace | `pnpm` workspaces | Lowest-friction monorepo setup that still gives shared lockfile, efficient installs, and clean workspace linking for `apps/web`, `apps/api`, and an optional shared package later. |
| Monorepo orchestration | Start with workspace scripts only; skip Nx/Turborepo on day 1 | For a brand-new repo with just web + API, extra orchestration is avoidable overhead. `pnpm` workspaces are enough until build/test graphs become painful. |
| Frontend | React + TypeScript + Vite | Fastest path to a mobile-first SPA, minimal setup, strong default DX, and easy local proxying to the API server. |
| Backend | Express 5 + TypeScript + `tsx` for dev | Express stays close to the Node/HTTP model, has the lowest middleware friction for uploads and sessions, and works cleanly with generic OIDC libraries and mock routes. |
| SQLite access | `better-sqlite3` | Very small conceptual surface area, synchronous API that is straightforward for an MVP, easy local-file operation, and no ORM ceremony required up front. |
| Upload handling | `multer` with route-scoped `DiskStorage` | Matches the local-file requirement directly; simple multipart handling with disk destinations for user reference images. |
| Session/auth | `express-session` with cookie sessions; persist sessions in SQLite using a compatible SQLite store; real OIDC via `openid-client`, dev/mock login via a dedicated mock route | Keeps auth simple, lets mock login and real OIDC share the same app session shape, and matches the provided `.well-known` discovery endpoint requirement. |
| Image generation integration | Official `openai` Node SDK behind a thin app service with `mock` and `openai` modes | Lets the team ship the task/result flow immediately, then switch from fake image jobs to real `gpt-image-2` calls without changing route contracts. |

### Recommended Dependency Set

Minimal, pragmatic dependency set for the first cut:

**Root / workspace**
- `pnpm` workspaces
- TypeScript at the repo level

**Web (`apps/web`)**
- `react`
- `react-dom`
- `vite`
- `typescript`

**API (`apps/api`)**
- `express`
- `typescript`
- `tsx`
- `better-sqlite3`
- `multer`
- `express-session`
- `openid-client`
- `openai`
- optional: `better-sqlite3-session-store` for persistent sessions

This keeps the core stack small while covering every requirement already stated in `need.md`.

### Why Express Over Fastify Here

Express is the more pragmatic fit for this specific MVP because:

- The upload path is especially simple with `multer`, whose primary documentation and examples are Express-oriented.
- `express-session` is the most direct route to cookie-backed sessions, including SQLite-backed compatible stores.
- Generic OIDC integration is straightforward with `openid-client` plus normal Express routes.
- The repo does not yet have performance constraints or existing plugin patterns that would justify Fastify-specific setup.

Fastify remains a valid alternative, but for this repo's stated constraints, it adds plugin decisions without reducing the number of concepts the MVP needs.

### Recommended Auth / Session Approach

Use one session model for both mock and real login:

1. `express-session` creates and reads the app session cookie.
2. In mock mode, a route such as `/auth/mock/login` inserts a synthetic local user into the session and skips the external provider.
3. In real mode, `openid-client` performs OIDC discovery from the provided `.well-known` endpoint, redirects for authorization, validates the callback, then stores the local user ID in the same session.
4. User/account linkage can stay minimal for MVP: one `users` table and one `oauth_accounts` table is enough.

Why this fits the constraints:

- It preserves one app-level contract regardless of whether OAuth is mocked.
- It avoids committing early to a heavyweight auth framework.
- It matches the requirement that OAuth can be mocked first while still supporting the real provider later.
- It works naturally with server-rendered or SPA-style clients because the backend owns the session cookie.

### Recommended SQLite Approach

Use `better-sqlite3` directly with small repository/service modules and SQL migrations kept in plain files.

Why this is a good MVP fit:

- The app is explicitly local-first in storage terms: SQLite plus local image directories. See `need.md:241-263`.
- The data model is relational but not large: users, uploads, tasks, results, gallery, history. See `need.md:247-255`.
- `better-sqlite3` reduces moving parts compared with introducing both an ORM and a migration framework on day 1.

For the first cut, simple startup scripts such as `db:init`, `db:migrate`, and `db:seed` are enough.

### Recommended Upload Handling

Use `multer` with disk-backed destinations and keep it route-scoped.

Suggested split:

- `data/uploads/identity/` for user identity reference images
- `data/uploads/style/` for style reference images
- `data/generated/` for generated avatar outputs

Why it fits:

- Directly matches the requirement for local file directory storage. See `need.md:54-56` and `need.md:241-263`.
- Keeps the upload implementation simple and visible.
- Makes the mock flow and the real image-generation flow use the same storage layout.

### Recommended Scripts Shape

For a brand-new repo, keep scripts obvious rather than clever.

Suggested root script set:

- `dev` — run web and API in parallel
- `build` — build both apps
- `typecheck` — run TypeScript checks across workspaces
- `lint` — lint both apps
- `db:init` — create SQLite file and baseline schema
- `db:migrate` — run SQL migrations
- `db:seed` — seed a mock user and sample tasks/images

Suggested API script set:

- `dev` — `tsx watch src/index.ts`
- `start` — run compiled server
- `db:migrate`
- `db:seed`

Suggested web script set:

- `dev` — Vite dev server
- `build`
- `preview`

This script shape is sufficient for the stated MVP without adding orchestration complexity early.

### External References

- [pnpm workspaces](https://pnpm.io/workspaces) — Official workspace support for monorepos; relevant because the repo explicitly wants a monorepo and pnpm provides shared-lockfile and workspace-linking behavior with low overhead.
- [npm workspaces](https://docs.npmjs.com/cli/v9/using-npm/workspaces/?v=true) — Useful baseline comparison; confirms that workspaces are first-class in standard Node tooling, but pnpm is a better fit here for monorepo ergonomics.
- [Express](https://expressjs.com/) — Official framework docs; relevant because Express offers the lowest-friction backend foundation for middleware-heavy MVP work.
- [Multer middleware](https://expressjs.com/en/resources/middleware/multer.html) — Official upload middleware docs; relevant for local `multipart/form-data` handling and disk-backed file storage.
- [express-session](https://expressjs.com/en/resources/middleware/session.html) — Official session middleware docs; relevant because cookie-backed sessions are the cleanest way to support both mock and real OAuth in one backend.
- [openid-client](https://www.npmjs.com/package/openid-client) — Official package page/docs hub for generic OAuth 2 / OIDC client flows, including discovery and authorization code flow; relevant because the product brief provides an OIDC discovery URL instead of a framework-specific auth provider.
- [openid-client API docs](https://github.com/panva/node-openid-client/blob/main/docs/README.md) — Shows discovery and PKCE-based authorization code flow; relevant for integrating the provided `.well-known` endpoint.
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) — Documents the simple local SQLite connection model; relevant because the MVP uses SQLite and benefits from low ceremony.
- [OpenAI Images API reference](https://platform.openai.com/docs/api-reference/images/create) — Confirms `/images/generations` is the correct API family for image creation.
- [OpenAI image generation guide](https://platform.openai.com/docs/guides/image-generation?image-generation-model=dall-e-2) — Documents current image-generation model usage patterns and supports a thin service wrapper for swapping between mock and real generation.

### Related Specs

- `need.md` — Primary product and technical direction for this MVP.
- `.trellis/tasks/05-02-dayu-avatar-mvp/task.json` — Task record for the planning effort.
- `.trellis/spec/backend/index.md` — Backend spec index; currently scaffold-only.
- `.trellis/spec/backend/database-guidelines.md` — Database conventions placeholder; useful future location for codifying the chosen SQLite patterns.
- `.trellis/spec/backend/directory-structure.md` — Backend layout placeholder; useful future location for codifying `apps/api` structure.
- `.trellis/spec/frontend/index.md` — Frontend spec index; currently scaffold-only.

## Caveats / Not Found

- No app code exists yet, so there are no established in-repo implementation patterns to preserve.
- The Trellis spec files are placeholders, not project-specific rules yet.
- `openid-client` documentation indicates a modern Node baseline; verify the final project Node version before locking the auth implementation.
- This research intentionally favors the smallest dependency set that still supports a real upgrade path from mock login/mock image generation to real OIDC/OpenAI integration.