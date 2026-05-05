# Research: config audit

- **Query**: Audit config/build/PWA/repo hygiene for `/home/wakefun/project/dayu-avatar` for Trellis task `.trellis/tasks/05-05-audit-fix-project-issues`; focus on package scripts, TypeScript/Vite/PWA/Tailwind configs, gitignore hygiene, build artifacts, and non-destructive improvements.
- **Scope**: mixed (internal inspection plus PWA installability docs lookup)
- **Date**: 2026-05-05

## Findings

### Files Found

| File Path | Description |
|---|---|
| `package.json` | Root workspace scripts and `packageManager` pin (`pnpm@10.20.0`) |
| `pnpm-workspace.yaml` | Workspace includes `apps/*` |
| `apps/api/package.json` | API dev/build/typecheck/lint scripts |
| `apps/web/package.json` | Web dev/build/typecheck/lint scripts and Vite/Tailwind dependencies |
| `tsconfig.base.json` | Shared strict TypeScript options |
| `apps/api/tsconfig.json` | API CommonJS build output to `apps/api/dist` |
| `apps/web/tsconfig.json` | Web Vite/Bundler TypeScript settings |
| `eslint.config.mjs` | Flat ESLint config and ignored generated directories |
| `apps/web/vite.config.ts` | Vite React/Tailwind plugins and `/api`/`/static` dev proxy |
| `apps/web/src/styles.css` | Tailwind v4 import, font import, and base/theme globals |
| `apps/web/index.html` | Manifest/theme/apple-touch-icon wiring |
| `apps/web/public/manifest.webmanifest` | PWA manifest |
| `apps/web/public/sw.js` | Manual service worker shell cache/fetch strategy |
| `.gitignore` | Local/runtime/build ignore rules |
| `.env.example` | Tracked backend environment reference |
| `.trellis/tasks/05-05-audit-fix-project-issues/research/code-audit.md` | Prior code audit with service worker fallback finding |

### Code Patterns

#### 1. Medium — PWA offline caching remains incomplete around built Vite assets

- **Location**: `apps/web/public/sw.js:1-5`, `apps/web/public/sw.js:24-30`, `apps/web/dist/assets/index-9ERX2Jdw.js`, `apps/web/dist/assets/index-Ch9TV3CP.css`, `.trellis/tasks/05-05-audit-fix-project-issues/research/code-audit.md:56-61`
- **What exists**: The current working tree service worker caches only `['/', '/manifest.webmanifest', '/logo.png']` during install. The current fetch handler uses `/` fallback only for navigation requests and `caches.match(request)` for non-navigation requests.
- **Why it matters**: This appears to address the exact HTML-as-JS/CSS fallback called out in `code-audit.md`, but built Vite JS/CSS under `/assets/` are still not precached or runtime-cached by this service worker. Offline reload can still serve cached HTML while failing the JS/CSS asset requests.
- **Severity**: Medium for PWA/offline reliability.
- **Non-destructive fix**: Yes. Keep navigation-only HTML fallback and add `/assets/` runtime caching, or adopt a Vite PWA/Workbox precache manifest so built hashed assets are cached intentionally.

#### 2. Medium — PWA manifest icon set is incomplete and size metadata does not match the actual PNG

- **Location**: `apps/web/public/manifest.webmanifest:11-16`, `apps/web/index.html:9-11`, `apps/web/public/logo.png`
- **What exists**: The manifest declares a single icon entry at `/logo.png` with `sizes: "512x512"` and `purpose: "any maskable"`. The actual `apps/web/public/logo.png` file is a `1254 x 1254` PNG, and no 192x192 icon entry is declared.
- **Why it matters**: Chrome installability guidance expects manifest icons including 192px and 512px sizes, and manifest `sizes` metadata should describe the actual image resource. A single mismatched 512 declaration can reduce install prompt reliability and launcher/splash icon quality.
- **Severity**: Medium for PWA installability/quality.
- **Non-destructive fix**: Yes. Add explicit generated icon assets such as `icon-192.png` and `icon-512.png` under `apps/web/public/`, update `manifest.webmanifest`, and keep the existing `/logo.png` favicon/apple-touch-icon if desired.

#### 3. Low — Manual service worker JavaScript is outside current lint/typecheck coverage

- **Location**: `apps/web/public/sw.js`, `apps/web/package.json:8-10`, `apps/web/tsconfig.json:11`, `eslint.config.mjs:7`
- **What exists**: Web build runs `tsc -p tsconfig.json && vite build`; typecheck includes `src/**/*` and `vite.config.ts`; lint script targets only `src --ext .ts,.tsx`. The manual service worker lives in `public/sw.js`, so PWA fetch/cache changes are copied by Vite but not typechecked or linted by the configured scripts.
- **Why it matters**: Service worker regressions can pass normal verification commands even though they affect install/offline behavior.
- **Severity**: Low.
- **Non-destructive fix**: Yes. Extend lint coverage to `public/sw.js` with service-worker globals, or move service worker source into a typed/generated PWA build path.

#### 4. Low — Vite dev proxy target is hard-coded separately from API `PORT`

- **Location**: `apps/web/vite.config.ts:7-11`, `apps/api/src/index.ts:199-200`, `.env.example:4-5`
- **What exists**: API `PORT` can be set through root `.env` and defaults to `3001`; Vite proxies `/api` and `/static` to hard-coded `http://localhost:3001`.
- **Why it matters**: Local dev breaks if `PORT` is changed without also editing Vite config; `pnpm dev` can start both processes while the frontend proxies to the wrong API port.
- **Severity**: Low; only matters when overriding the default port.
- **Non-destructive fix**: Yes. Either document the coupling explicitly or have `vite.config.ts` derive the proxy target from the same root env/default.

#### 5. Low — Duplicate tracked logo asset outside Vite `public/` appears unused by app config

- **Location**: `apps/web/logo.png`, `apps/web/public/logo.png`, `apps/web/public/manifest.webmanifest:13`, `apps/web/index.html:9-11`, `apps/web/public/sw.js:2`
- **What exists**: `apps/web/logo.png` and `apps/web/public/logo.png` have the same SHA-256 hash and dimensions. App-facing references resolve `/logo.png`, which comes from `apps/web/public/logo.png` in Vite.
- **Why it matters**: Duplicate binary assets can drift and make the canonical PWA icon source unclear.
- **Severity**: Low repo hygiene.
- **Non-destructive fix**: Runtime-safe if confirmed unused outside the app, but it is still a tracked-file deletion/cleanup; confirm with the main agent before removing.

### Positive / No-Issue Observations

- Root/package scripts are aligned with workspace expectations: root `dev`, `build`, `typecheck`, and `lint` are defined at `package.json:6-10`; API scripts at `apps/api/package.json:6-10`; web scripts at `apps/web/package.json:6-10`.
- TypeScript configs are coherent for this repo shape: strict shared base at `tsconfig.base.json:4-13`, API CommonJS emit at `apps/api/tsconfig.json:4-8`, and web Vite/Bundler settings at `apps/web/tsconfig.json:4-11`.
- Tailwind v4 wiring is present without needing legacy Tailwind/PostCSS config: `apps/web/vite.config.ts:1-6` uses `@tailwindcss/vite`, and `apps/web/src/styles.css:1-9` imports Tailwind and defines minimal theme/base globals.
- Gitignore hygiene covers local/runtime/build artifacts: `.env` and `.env.*` at `.gitignore:19-21`, `data` at `.gitignore:22`, workspace `dist` at `.gitignore:23`, workspace `node_modules` at `.gitignore:24`, and Vite cache at `.gitignore:25`.
- Build artifacts currently exist under `apps/api/dist/` and `apps/web/dist/`, but `git ls-files` showed no tracked dist/data outputs; `git check-ignore` confirmed the ignore rules for `.env`, `apps/*/dist`, `data`, `apps/*/node_modules`, and `apps/*/.vite`.
- `.env.example` is tracked and root `.env` is ignored. The local `.env` file exists but was not read.

### External References

- [web.dev: What does it take to be installable?](https://web.dev/install-criteria) — Chrome install prompt criteria include a manifest with `name`/`short_name`, `icons` including 192px and 512px, `start_url`, and compatible `display`.
- [web.dev: Add a web app manifest](https://web.dev/articles/add-manifest?hl=en) — Manifest icon entries should include `src`, `sizes`, and `type`; Chromium expects at least 192x192 and 512x512 icons, with optional `purpose: "any maskable"` for maskable usage.

### Related Specs

- `.trellis/spec/frontend/directory-structure.md` — frontend package commands, Vite env typing, and validation requirements.
- `.trellis/spec/frontend/component-guidelines.md` — Tailwind as primary styling mechanism and PWA install affordance contract.
- `.trellis/spec/backend/directory-structure.md` — API package commands, root `.env.example`, root `.env` loading, and ignored `data/` runtime storage.
- `.trellis/spec/backend/error-handling.md` — `AUTH_MODE`/`GENERATION_MODE` env contracts, PWA wiring contract, and required verification commands.

## Caveats / Not Found

- The active Trellis task pointer was unset in the worktree, but the user explicitly provided the task path; this file was written to that requested path.
- This was read-only inspection except creating/writing this research file. No source/config files were modified by this audit.
- The working tree already had modified source/PWA files before this research (`apps/api/src/index.ts`, `apps/web/public/sw.js`, `apps/web/src/components/UploadCard.tsx`, `apps/web/src/lib/api.ts`). Findings reflect the current main project working tree at inspection time, not necessarily committed `main`.
- No additional high-severity package script, TypeScript, Vite, Tailwind, gitignore, or tracked-build-artifact findings were found beyond the PWA/service-worker and PWA-manifest items above.
- `pnpm build`, `pnpm lint`, and browser PWA audits were not run because the requested role was read-only inspection and build commands can write artifacts.
- Real OIDC/OpenAI/PWA install behavior was not exercised; valid environment/browser context is required.
