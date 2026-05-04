# Directory Structure

> How frontend code is organized in this project.

---

## Scenario: Mobile React SPA workspace

### 1. Scope / Trigger

- Trigger: frontend work for the Dayu Avatar MVP.
- The frontend lives in `apps/web` as a React + TypeScript + Vite mobile SPA.

### 2. Signatures

- Workspace package: `apps/web/package.json` with name `@dayu/web`.
- Dev command: `pnpm --filter @dayu/web dev`.
- Build command: `pnpm --filter @dayu/web build`.
- Typecheck command: `pnpm --filter @dayu/web typecheck`.
- Lint command: `pnpm --filter @dayu/web lint`.
- Vite env typing: `apps/web/src/vite-env.d.ts`.

### 3. Contracts

- `src/App.tsx` owns route wiring and auth redirect behavior.
- `src/components/` contains shared UI primitives and shell components.
- `src/components/ui.ts` is the shared Tailwind styling helper module for reusable class recipes and `cx(...)` composition.
- `src/pages/` contains route-level pages.
- `src/lib/api.ts` contains fetch wrappers for backend contracts.
- `src/lib/types.ts` contains shared frontend API/domain types.
- `src/styles.css` contains Tailwind import plus minimal theme/base globals; page-level business styling should live in components via Tailwind classes.

### 4. Validation & Error Matrix

- New route -> add route entry in `App.tsx` and navigation entry in the shell when global navigation is needed.
- New API call -> add typed function in `src/lib/api.ts` and matching type in `src/lib/types.ts`.
- New Vite env usage -> ensure `vite-env.d.ts` remains present.
- Protected page -> assume auth is checked by `App.tsx`; do not duplicate login redirects inside every page.

### 5. Good/Base/Bad Cases

- Good: page components call typed API helpers and render shared card/button/list primitives.
- Good: shared Tailwind class recipes that repeat across pages live in `src/components/ui.ts` instead of being recopied or reintroduced as global business classes.
- Base: keep state local to the page when it is not shared across routes.
- Bad: introduce a global state library before multiple pages need shared mutable client-only state.
- Bad: move page styling back into a large global stylesheet after the Tailwind migration.

### 6. Tests Required

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` must pass.
- Browser smoke test should cover login, drawer navigation, generation page, upload, result, gallery, queue/history/settings reachability.

### 7. Wrong vs Correct

#### Wrong

```ts
fetch('/api/gallery-items').then((r) => r.json())
```

#### Correct

```ts
const response = await api.listGalleryItems();
```

---

## Directory Layout

```text
apps/web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── styles.css
    ├── vite-env.d.ts
    ├── components/
    │   └── ui.ts
    ├── lib/
    └── pages/
```

---

## Module Organization

- Route-level screens belong in `src/pages`.
- Reusable visual primitives and shell elements belong in `src/components`.
- API and type boundaries belong in `src/lib`.
- Avoid feature directories until a feature has enough internal modules to justify one.

---

## Naming Conventions

- React component files use PascalCase (`GeneratePage.tsx`, `AppShell.tsx`).
- Non-component library files use lowercase names (`api.ts`, `types.ts`).
- Page components end with `Page`.

---

## Examples

- `src/App.tsx` is the reference for route and auth guard setup.
- `src/components/AppShell.tsx` is the reference for the top nav + side drawer shell.
- `src/lib/api.ts` is the reference for backend API calls.
