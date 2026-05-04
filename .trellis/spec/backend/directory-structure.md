# Directory Structure

> How backend code is organized in this project.

---

## Scenario: MVP API workspace

### 1. Scope / Trigger

- Trigger: backend work for the Dayu Avatar MVP.
- The backend lives in `apps/api` as a TypeScript Express service.

### 2. Signatures

- Workspace package: `apps/api/package.json` with name `@dayu/api`.
- Dev command: `pnpm --filter @dayu/api dev`.
- Build command: `pnpm --filter @dayu/api build`.
- Typecheck command: `pnpm --filter @dayu/api typecheck`.
- Lint command: `pnpm --filter @dayu/api lint`.
- Environment example: repository root `.env.example`.
- Runtime configuration: repository root `.env` is auto-loaded by the API at startup; existing system environment variables take precedence.

### 3. Contracts

- API routes are under `/api/**`.
- Static asset routes are limited to `/static/uploads/**` and `/static/generated/**`.
- Runtime data is written under repo-local `data/`, which is ignored by git.
- API code must map snake_case database rows to camelCase JSON responses at the boundary.

### 4. Validation & Error Matrix

- New route under `/api/**` that reads user data -> must use `requireAuth` unless explicitly public.
- New static file route -> must not expose database/session/internal files.
- New env key -> must be documented in root `.env.example`.
- Do not place new env examples under workspace packages unless a package truly has isolated runtime config.

### 5. Good/Base/Bad Cases

- Good: keep MVP route, schema, mapper, and helper code in `src/index.ts` while the service is small.
- Base: extract modules only when a section becomes difficult to navigate or repeated across features.
- Bad: add a framework/orchestration layer before the two-workspace MVP needs it.

### 6. Tests Required

- Root `pnpm typecheck`, `pnpm lint`, and `pnpm build` must pass after backend changes.
- Runtime smoke checks should hit `/api/health` before exercising protected routes.

### 7. Wrong vs Correct

#### Wrong

```text
src/
└── many abstraction directories before any repeated pattern exists
```

#### Correct

```text
apps/api/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

Repository root:

```text
.env.example
```

---

## Directory Layout

```text
apps/api/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

Repository root:

```text
.env.example
```

---

## Module Organization

The current MVP keeps backend logic in one file because the service is small and route contracts are still evolving. Extract repositories/services later when a pattern repeats enough to justify it.

---

## Naming Conventions

- Workspace package: `@dayu/api`.
- Route handlers: keep REST resource names aligned with PRD contracts (`generation-tasks`, `gallery-items`).
- Helper functions: use verb-first names (`createGenerationTask`, `ensureGenerationResult`, `mapGalleryItem`).

---

## Examples

- `apps/api/src/index.ts` is the current reference implementation for auth, uploads, mock generation, queue/history, and gallery routes.
