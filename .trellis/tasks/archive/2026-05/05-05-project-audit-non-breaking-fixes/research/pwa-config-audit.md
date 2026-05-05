# Research: PWA / Vite / Build / Package Configuration Audit

- **Query**: Audit `/home/wakefun/project/dayu-avatar` for PWA/service worker/manifest/Vite/build/package configuration and scripts; identify likely bugs, stale config, security/cache pitfalls, CI/build problems, and low-risk optimization opportunities.
- **Scope**: internal
- **Date**: 2026-05-05

## Files Inspected

| File Path | Description |
|---|---|
| `package.json` | Root workspace scripts and pnpm package-manager pin |
| `pnpm-workspace.yaml` | Workspace package glob |
| `apps/web/package.json` | Web dev/build/typecheck/lint scripts and Vite/Tailwind/React deps |
| `apps/api/package.json` | API dev/build/typecheck/lint scripts and Express deps |
| `apps/web/vite.config.ts` | Vite plugins, dev server port, `/api` and `/static` proxy target |
| `apps/web/public/sw.js` | PWA service worker cache and fetch behavior |
| `apps/web/public/manifest.webmanifest` | PWA manifest metadata and icon declarations |
| `apps/web/index.html` | Manifest, theme-color, favicon, and apple-touch icon wiring |
| `apps/web/src/main.tsx` | Service worker registration |
| `apps/web/src/App.tsx` | `beforeinstallprompt` capture and install action handler |
| `apps/web/src/components/AppShell.tsx` | Drawer install affordance UI |
| `apps/api/src/index.ts` | API runtime config, static asset serving, Node runtime feature usage |
| `eslint.config.mjs` | ESLint ignores/globals and service-worker lint globals |
| `tsconfig.base.json`, `apps/web/tsconfig.json`, `apps/api/tsconfig.json` | Shared and package TypeScript settings |
| `.env.example` | Documented local server/web origin defaults |
| `.gitignore` | Ignored runtime/build artifacts |
| `.trellis/spec/frontend/directory-structure.md` | Frontend PWA/build contracts |
| `.trellis/spec/backend/error-handling.md` | Backend/PWA and validation contracts |
| `.trellis/spec/backend/database-guidelines.md` | Node 24 / `node:sqlite` runtime contract |

## Findings

| ID | Severity | Evidence | Why it matters | Suggested non-breaking fix | Destructive / risky alternative to avoid |
|---|---|---|---|---|---|
| F1 | Medium | `apps/web/vite.config.ts:14-18` pins `server.port: 5173` and proxies `/api` + `/static`; no `strictPort` is set. `apps/api/src/index.ts:201` defaults `webOrigin` to `http://localhost:5173`; `.env.example:5` also sets `WEB_ORIGIN=http://localhost:5173`. | If Vite silently falls back to another port when 5173 is busy, auth redirects and documented web origin can point at the wrong dev URL. This can look like an auth/PWA install bug even though the proxy is otherwise configured. | Add `server.strictPort: true` so local dev fails fast when 5173 is occupied, or make the dev origin/port contract explicit in scripts and docs. | Do not broadly change API redirect origins or PWA absolute paths without a deployment-origin plan. |
| F2 | Medium | `apps/api/src/index.ts:2` imports `DatabaseSync` from `node:sqlite`; `.trellis/spec/backend/database-guidelines.md:12` says to use Node 24 built-in `node:sqlite`. Root `package.json:1-20` has no `engines.node`; audit search found no `.nvmrc` or `.node-version`. | CI/deploy machines using older Node can install successfully but fail at build/runtime when `node:sqlite` or Vite’s modern Node requirements are unavailable. | Add a root Node runtime pin such as `engines.node` plus `.nvmrc`/`.node-version`, aligned with the project’s Node 24 contract; configure CI to use that version. | Do not replace `node:sqlite` with a native third-party SQLite dependency just to support older Node unless the install/runtime policy changes. |
| F3 | Low | Audit search found no `.github/workflows`, `Dockerfile`, `vercel.json`, or `netlify.toml`. Root scripts exist at `package.json:7-10` (`dev`, `build`, `typecheck`, `lint`). | There is no local CI/build configuration enforcing the existing lint/typecheck/build contracts, so PWA/service-worker/manifest regressions rely on manual checks. | Add a small CI workflow that uses pnpm, installs from `pnpm-lock.yaml`, and runs `pnpm lint`, `pnpm typecheck`, and `pnpm build`; optionally add an icon-dimension/manifest-file existence check. | Do not add deployment/secrets-heavy CI or mandatory browser PWA audits before credentials/environments are defined. |
| F4 | Low | `apps/web/public/sw.js:1-5` uses a manually versioned cache name (`dayu-avatar-shell-v2`) and precaches `['/', '/manifest.webmanifest', '/logo.png', '/icon-192.png', '/icon-512.png']`. | Manifest/icon/offline-shell updates require a service-worker content/cache-version change. If static PWA assets change but `sw.js` does not, installed users may keep stale cached shell metadata/assets until browser cache eviction or a later SW update. | Keep the manual approach but require bumping `CACHE_NAME` when shell assets change; optionally add a small validation comment/test. A build-derived revision or Vite PWA/Workbox precache could be considered later. | Do not adopt a PWA plugin/Workbox migration as a “quick” change without testing install/update/offline behavior. |
| F5 | Low | `apps/web/public/sw.js:29-47` cache-first caches every successful same-origin `/assets/` response in the single app cache; old caches are deleted only when `CACHE_NAME` changes (`sw.js:8-14`). | Vite hashed assets are safe candidates for caching, but the cache has no max age/entry/size policy. Over time, dynamic imports or additional emitted assets could increase storage use until the next cache-name bump. | Keep `/assets/` runtime caching but add a small expiration/entry cap if asset volume grows, or migrate this single policy to Workbox with an expiration plugin. | Do not cache `/static/uploads` or `/static/generated` user media as part of this optimization unless privacy/storage semantics are reviewed. |
| F6 | Low | `apps/api/src/index.ts:325-326` serves `/static/uploads` and `/static/generated` with plain `express.static(...)` and no cache options. | Generated/uploaded file URLs appear immutable, but browsers will use Express defaults rather than explicit long-lived static caching. This is a low-risk performance opportunity for image-heavy PWA usage. | If asset URLs are immutable, add explicit static cache options such as `maxAge`/`immutable` for generated/uploaded assets, while preserving access patterns. | Do not apply long-lived caching to mutable paths or to database/runtime directories; `.trellis/spec/backend/database-guidelines.md:67` warns not to serve the whole `data/` directory. |
| F7 | Low | `apps/web/index.html:10-11` uses `/logo.png` for favicon and apple touch icon. Image metadata: `apps/web/public/logo.png` is `1254 x 1254`; manifest icons are separate valid `192 x 192` and `512 x 512` PNGs. | The manifest install icons are correct, but iOS/apple home-screen icon handling may downscale a large general logo instead of using a purpose-built touch icon. This can increase transfer size and reduce icon quality/predictability. | Add an explicit apple touch icon asset (commonly 180x180) and update `index.html`, while keeping `/logo.png` for favicon/brand use if needed. | Do not delete or replace `/logo.png` globally unless all references are checked. |
| F8 | Low | `apps/web/src/main.tsx:14-17` registers `/sw.js` and intentionally ignores the registration promise (`void navigator.serviceWorker.register('/sw.js')`). | Registration failures caused by scope/origin/HTTPS/cache issues are silent, which makes PWA install/offline failures harder to diagnose during smoke testing. | Add a `.catch(...)` that logs in development only, or otherwise records non-user-blocking diagnostics. | Do not block app startup or show end-user errors when service worker registration fails; the spec says PWA install is non-blocking. |
| F9 | Low | Root-relative PWA paths are used across `apps/web/public/manifest.webmanifest:5-6` (`start_url`/`scope` `/`), `apps/web/index.html:8-11` (`/manifest.webmanifest`, `/logo.png`), and `apps/web/src/main.tsx:16` (`/sw.js`). Vite config has no `base` override. | The current configuration assumes deployment at the domain root. A subpath deployment would break service-worker scope, manifest/icon paths, and possibly SPA asset loading. | Document “served from `/`” as the deployment contract, or only if subpath deployment is needed, align Vite `base`, manifest paths, and SW registration/scope together. | Do not change these paths piecemeal; partial path changes can break installability or offline behavior. |
| F10 | Low | `apps/web/src/components/AppShell.tsx:113-119` always renders a clickable install button and changes only the label when `installAvailable` is false; `apps/web/src/App.tsx:107-115` then returns early if no prompt exists. | Functionally safe, but automated/manual PWA tests can misread the unsupported state as an actionable install control. | Add `disabled={!installAvailable}` and/or `aria-disabled` styling while keeping the unsupported explanatory label. | Do not remove the install affordance entirely; the spec says it should remain a non-blocking UI affordance. |

## Positive Confirmations / Not Findings

| Area | Evidence | Result |
|---|---|---|
| Manifest install icons | `apps/web/public/manifest.webmanifest:10-23`; file metadata reports `icon-192.png` is `192 x 192` and `icon-512.png` is `512 x 512`. | No current manifest icon-size bug found. |
| Service worker HTML fallback | `apps/web/public/sw.js:24-35` uses cached `/` fallback only for navigation requests and uses `caches.match(request)` for other non-asset GETs. | The prior “cached HTML returned for JS/CSS asset requests” pitfall appears fixed. |
| Vite proxy target | `apps/web/vite.config.ts:8-18` reads root `.env` `PORT`/`process.env.PORT` and proxies `/api` and `/static` to the API target. | Matches `.trellis/spec/frontend/directory-structure.md:35-36`. |
| Service worker lint coverage | `apps/web/package.json:9-10` lints `src public/sw.js`; `eslint.config.mjs:23-29` provides service worker globals. | Current web lint script includes the service worker. |
| Ignored build/runtime artifacts | `.gitignore:16-25` ignores `node_modules`, `dist`, `.env*`, `data`, `apps/*/dist`, and app `.vite` dirs. | No obvious tracked-build-artifact configuration issue found from file inspection. |

## Validation Performed

| Command | Result |
|---|---|
| `pnpm --dir /home/wakefun/project/dayu-avatar --filter @dayu/web lint` | Passed |
| `pnpm --dir /home/wakefun/project/dayu-avatar --filter @dayu/web typecheck` | Passed |
| `pnpm --dir /home/wakefun/project/dayu-avatar --filter @dayu/api lint` | Passed |
| `pnpm --dir /home/wakefun/project/dayu-avatar --filter @dayu/api typecheck` | Passed |

## Related Specs

- `.trellis/spec/frontend/directory-structure.md:21-35` — service worker, manifest icon, Vite proxy, and no-HTML-fallback contracts.
- `.trellis/spec/frontend/directory-structure.md:43-57` — required validation after service-worker/build changes.
- `.trellis/spec/backend/error-handling.md:141,157` — PWA install wiring is non-blocking and unsupported browsers must keep the app usable.
- `.trellis/spec/backend/database-guidelines.md:12` — Node 24 `node:sqlite` runtime requirement.
- `.trellis/spec/backend/database-guidelines.md:67` — do not serve the whole `data/` directory statically.

## Caveats / Not Found

- Trellis current-task resolver returned no active task, so this report used the explicit task path provided by the user.
- `pnpm build` was not run because it writes build artifacts outside the research directory; this audit was requested as non-code-modifying research.
- No external web search was used; findings are based on local repo inspection and existing project specs.
- Browser installability/offline behavior was not smoke-tested in Chrome/Safari; findings are static-analysis oriented.
