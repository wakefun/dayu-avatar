# Research: PWA plugin migration

- **Query**: Research migrating this repo's hand-written PWA service worker to Workbox/Vite PWA plugin for `/home/wakefun/project/dayu-avatar` task `.trellis/tasks/05-05-implement-approved-optimizations`. Inspect local PWA files and package config. Cover current behavior to preserve, Vite plugin configuration, runtime caching for assets/navigation fallback, how to avoid caching `/static` user media, validation commands, and risks.
- **Scope**: mixed
- **Date**: 2026-05-05

## Findings

### Files Found

| File Path | Description |
|---|---|
| `apps/web/public/sw.js` | Current hand-written service worker with shell precache, navigation fallback, `/assets/` runtime cache, API/static exclusions. |
| `apps/web/src/main.tsx` | React entry point and manual `navigator.serviceWorker.register('/sw.js')` registration. |
| `apps/web/vite.config.ts` | Current Vite config; plugins are Tailwind and React only; dev proxy includes `/api` and `/static`. |
| `apps/web/package.json` | Web package scripts/dependencies; no `vite-plugin-pwa` or Workbox dependencies currently listed. |
| `package.json` | Root workspace scripts: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r lint`; package manager `pnpm@10.20.0`; Node `>=24`. |
| `pnpm-lock.yaml` | Lockfile confirms web importer has Vite/React/Tailwind dependencies only; no `vite-plugin-pwa`/Workbox entries found. |
| `apps/web/index.html` | Contains manual manifest and icon links plus PWA meta tags. |
| `apps/web/public/manifest.webmanifest` | Existing manifest contents and icon definitions. |
| `apps/web/public/icon-192.png` | Existing 192px manifest icon. |
| `apps/web/public/icon-512.png` | Existing 512px manifest icon. |
| `apps/web/public/logo.png` | Existing logo/favicon/apple-touch-icon; current SW app shell precaches it. |
| `apps/api/src/index.ts` | API serves user media under `/static/uploads` and `/static/generated` with private media headers. |
| `.trellis/tasks/05-05-implement-approved-optimizations/prd.md` | Task acceptance criteria explicitly require Workbox/Vite PWA plugin and preservation of navigation fallback/static asset behavior/no user-media caching. |
| `.trellis/spec/frontend/directory-structure.md` | Frontend PWA contract and validation notes for current service worker. |
| `.trellis/spec/backend/database-guidelines.md` | Backend contract for `/static/uploads/**` and `/static/generated/**` static media URLs and headers. |
| `.trellis/spec/backend/error-handling.md` | Current cross-layer note that frontend PWA wiring uses manifest, `sw.js`, and `beforeinstallprompt`. |
| `eslint.config.mjs` | Contains a service-worker-specific global override only for `apps/web/public/sw.js`. |
| `apps/web/src/vite-env.d.ts` | Current Vite type references only `vite/client`; virtual PWA registration imports would need type coverage if used. |

### Current Behavior To Preserve

Current service worker (`apps/web/public/sw.js`):

```js
const CACHE_NAME = 'dayu-avatar-shell-v2';
const APP_SHELL = ['/', '/manifest.webmanifest', '/logo.png', '/icon-192.png', '/icon-512.png'];
```

- Install opens `dayu-avatar-shell-v2`, `cache.addAll(APP_SHELL)`, then calls `self.skipWaiting()` (`apps/web/public/sw.js:3-6`).
- Activate deletes every cache whose name differs from `dayu-avatar-shell-v2`, then calls `self.clients.claim()` (`apps/web/public/sw.js:8-15`).
- Fetch handler ignores non-GET requests, cross-origin requests, and same-origin `/api/` requests (`apps/web/public/sw.js:17-22`).
- Navigation requests use network first with cached `/` fallback only: `fetch(request).catch(() => caches.match('/'))` (`apps/web/public/sw.js:24-27`).
- Requests whose path starts with `/assets/` use `cacheFirst(request)` (`apps/web/public/sw.js:29-32`).
- Other eligible same-origin GET requests use network first with `caches.match(request)` fallback (`apps/web/public/sw.js:34`).
- `cacheFirst` caches only `response.ok` responses (`apps/web/public/sw.js:37-49`).

Current registration and install UI:

- `apps/web/src/main.tsx:14-22` manually registers `/sw.js` after `window` load and logs registration failure only in dev.
- `apps/web/src/App.tsx:62-70` captures `beforeinstallprompt`, prevents the browser default prompt, and stores the event.
- `apps/web/src/App.tsx:100-115` passes `installAvailable`/`onInstallApp` to `AppShell`, calls `prompt()`, awaits `userChoice`, then clears the prompt. This UI affordance is independent of the service worker registration path.
- `apps/web/index.html:5-10` includes `theme-color`, Apple mobile meta/title, manifest link, favicon, and apple-touch-icon links.
- `apps/web/public/manifest.webmanifest:1-24` includes Chinese app name/short name, description, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `orientation: "portrait"`, colors, and 192/512 PNG icons with `purpose: "any maskable"`.

Current static media behavior:

- API serves `/static/uploads` and `/static/generated` via Express static middleware (`apps/api/src/index.ts:325-326`).
- Static media responses set `Cache-Control: private, max-age=0, must-revalidate`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff` (`apps/api/src/index.ts:938-942`).
- Backend spec requires `file_assets.public_url` under `/static/uploads/...` or `/static/generated/...` and those private/no-referrer/nosniff headers (`.trellis/spec/backend/database-guidelines.md:39-40`).
- Frontend uses API-provided `/static/...` URLs for user media in images/downloads: upload previews use `asset.fileUrl` (`apps/web/src/components/UploadCard.tsx:65`), result images/downloads use `result.imageUrl` (`apps/web/src/pages/ResultPage.tsx:62-93`), history cards use `item.resultImageUrl` (`apps/web/src/components/Cards.tsx:62-70`), gallery cards use `item.thumbnailUrl ?? item.imageUrl` (`apps/web/src/components/Cards.tsx:97-102`), and user avatars use `user.avatarUrl` as a CSS background (`apps/web/src/components/AppShell.tsx`, `apps/web/src/pages/SettingsPage.tsx`).

### Package / Config State

- `apps/web/package.json:16-23` has dev dependencies for Tailwind, React types, `@vitejs/plugin-react`, `tailwindcss`, and `vite`; no PWA plugin or Workbox packages.
- `pnpm-lock.yaml:66-95` mirrors those web dependencies and does not contain `vite-plugin-pwa` or Workbox package entries from repository searches.
- `apps/web/vite.config.ts:11-20` currently uses `plugins: [tailwindcss(), react()]` and proxies `/api` and `/static` to the API server in local dev.
- `apps/web/package.json:9` lints `eslint src public/sw.js --ext .ts,.tsx,.js`; this script will need to align with any removal/move of `public/sw.js`.
- `eslint.config.mjs:22-29` only grants service worker globals to `apps/web/public/sw.js`; if using plugin-generated `generateSW`, this override may become obsolete. If using a custom source SW (`injectManifest`), the override path/type assumptions would need to follow the new SW source.
- `apps/web/tsconfig.json:7,10` includes `types: ["vite/client", "node"]` and `include: ["src/**/*", "vite.config.ts"]`. A manual `virtual:pwa-register` import usually requires adding plugin client types to declarations or compiler options.

### Related Specs / Task Notes

- `.trellis/tasks/05-05-implement-approved-optimizations/prd.md:19` assumes PWA migration should preserve offline shell behavior: navigation fallback to `/`, static asset caching, manifest icons, and no user media caching.
- `.trellis/tasks/05-05-implement-approved-optimizations/prd.md:31` requires migration from `apps/web/public/sw.js` to Workbox/Vite PWA plugin or equivalent generated SW setup.
- `.trellis/tasks/05-05-implement-approved-optimizations/prd.md:39-40` acceptance criteria require Workbox/Vite PWA plugin behavior plus `pnpm lint`, `pnpm typecheck`, and `pnpm build` passing.
- `.trellis/spec/frontend/directory-structure.md:21-23` currently names `apps/web/public/sw.js` as the service worker and notes PWA icons.
- `.trellis/spec/frontend/directory-structure.md:33` requires `/` fallback only for navigation requests and says built Vite assets under `/assets/` may use runtime caching but must never receive cached HTML as fallback.
- `.trellis/spec/frontend/directory-structure.md:43` says service worker changes require web lint/build and verification that non-navigation `/assets/` failures do not fall back to cached `/` HTML.
- `.trellis/spec/backend/error-handling.md:141` currently says frontend PWA wiring uses `manifest.webmanifest`, `sw.js`, and `beforeinstallprompt`; this spec will become stale if the generated SW filename/registration path changes.

### External References

- [Vite PWA Getting Started](https://vite-plugin-pwa.netlify.app/guide/) — install with `pnpm add -D vite-plugin-pwa`; add `VitePWA` to `vite.config.ts`; plugin can generate manifest, service worker, and registration script; `devOptions.enabled` can enable SW/manifest in dev. It uses Workbox under the hood.
- [Vite PWA Service Worker Strategies and Behaviors](https://vite-plugin-pwa.netlify.app/guide/service-worker-strategies-and-behaviors) — `generateSW` is the default strategy and generates the SW from Workbox config; `injectManifest` compiles custom SW code and injects the precache manifest. `registerType` controls browser update behavior; `autoUpdate` skips a user prompt flow.
- [Vite PWA Register Service Worker](https://vite-pwa-org.netlify.app/guide/register-service-worker) — `injectRegister` controls automatic registration. Values include `inline`, `script`, `script-defer`, `null` manual, and `auto` default. Script registration generates `/registerSW.js` and registers after load with scope `/`. Virtual modules such as `virtual:pwa-register` are available for manual registration.
- [Vite PWA Static Assets Handling](https://vite-plugin-pwa.netlify.app/guide/static-assets) — manifest icons in Vite `publicDir` are included in service worker precache by default; `includeAssets` can include additional public assets such as `logo.png`; default Workbox `globPatterns` are `**/*.{js,css,html}` and custom `globPatterns` must include all desired assets.
- [Vite PWA generateSW / Workbox config](https://vite-plugin-pwa.netlify.app/workbox/generate-sw.html) — `workbox.runtimeCaching` accepts routes with strategy handlers; `workbox.navigateFallbackDenylist` can exclude routes from app-shell fallback.
- [Workbox build reference](https://developer.chrome.com/docs/workbox/reference/workbox-build) — `generateSW` supports `navigateFallback`, `navigateFallbackAllowlist`, `navigateFallbackDenylist`, `runtimeCaching`, `skipWaiting`, and `clientsClaim`; `navigateFallback` must point to an HTML URL listed in the precache manifest.
- [Workbox routing docs](https://developer.chrome.com/docs/workbox/modules/workbox-routing) — navigation routes can use allowlists/denylists; if multiple routes match, the earliest registered route is used; without a default handler, unmatched requests go to the network as if there were no service worker.
- [Workbox strategies reference](https://developer.chrome.com/docs/workbox/reference/workbox-strategies) — `CacheFirst` serves cached response before network and is suitable for non-critical assets; `NetworkFirst` tries network then cache; `StaleWhileRevalidate` returns cached response while updating cache.

### Migration Shape: Vite Plugin Configuration

A `generateSW`-style migration maps closely to the current hand-written worker and avoids a custom service worker source:

- Add `vite-plugin-pwa` as a dev dependency to `apps/web` (or workspace-filtered web importer) so it appears under `apps/web` in `pnpm-lock.yaml`.
- Import `VitePWA` in `apps/web/vite.config.ts` and add it to `plugins` after or alongside Tailwind/React.
- Preserve manifest data either by:
  - keeping `apps/web/public/manifest.webmanifest` and `apps/web/index.html` link as-is while configuring only SW generation/registration, or
  - moving the manifest fields from `manifest.webmanifest` into the plugin `manifest` option and removing the manual link only if the plugin injects it.
- Existing manifest icon files can remain in `apps/web/public/`; Vite PWA docs say manifest icons in `publicDir` are included in precache by default.
- Include `logo.png` explicitly via `includeAssets: ['logo.png']` if the app still wants current app-shell precaching parity for favicon/apple touch icon.
- For current immediate-update parity, configure `registerType: 'autoUpdate'` and Workbox `skipWaiting: true`, `clientsClaim: true` (current SW calls `self.skipWaiting()` and `self.clients.claim()`).
- Registration can be handled by plugin injection (`injectRegister: 'script'` or `'script-defer'`) and then `apps/web/src/main.tsx` no longer needs manual `navigator.serviceWorker.register('/sw.js')`. If manual registration is retained via `virtual:pwa-register`, add `vite-plugin-pwa/client` typing coverage and keep dev-only error logging behavior intentionally.
- If using plugin-generated registration, note that default generated SW filename is commonly `sw.js`; confirm final emitted paths in `apps/web/dist/` after build.

Configuration concepts to map current behavior:

```ts
VitePWA({
  registerType: 'autoUpdate',
  injectRegister: 'script-defer',
  includeAssets: ['logo.png'],
  manifest: { /* same fields as public/manifest.webmanifest if moving manifest into plugin */ },
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
    navigateFallback: '/',
    navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/static(?:\/|$)/, /^\/assets\//],
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: ({ url, request }) =>
          request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
        handler: 'CacheFirst',
        options: {
          cacheName: 'dayu-avatar-assets',
          cacheableResponse: { statuses: [200] }
        }
      }
    ]
  }
})
```

Notes on the example above:

- The exact TypeScript type for `urlPattern` callbacks comes from Workbox/vite-plugin-pwa types; avoid relying on global `self` in `vite.config.ts` if TypeScript complains. A regex such as `/^\/assets\//` may be easier if it matches same-origin paths correctly in Workbox's generated SW context.
- If `globPatterns` is customized, Vite PWA docs warn it replaces the default pattern; keep `js`, `css`, and `html` in the pattern. Include `png`/`webmanifest` only if chosen precache behavior requires those assets beyond default manifest icon handling and `includeAssets`.
- Current SW caches `manifest.webmanifest` and icons in the same cache as runtime `/assets/`; Workbox will use separate precache/runtime caches. Behavior should be validated by outcomes rather than cache names.

### Runtime Caching and Navigation Fallback

Current behavior splits request categories:

- `/api/**`: bypass service worker entirely.
- navigation: network first, fallback to cached `/` only on network failure.
- `/assets/**`: cache first.
- other same-origin GET, including `/manifest.webmanifest`, `/logo.png`, icons, and `/static/**`: network first then exact cache fallback if previously cached.

Workbox/Vite PWA mapping:

- Let Workbox precache Vite build output (`index.html`, JS/CSS chunks) and manifest icons. This covers shell assets more deterministically than manual `APP_SHELL` and supports revisioning.
- Use `workbox.navigateFallback: '/'` for SPA navigation fallback, because Workbox requires the fallback HTML to be precached.
- Use `workbox.navigateFallbackDenylist` for non-SPA routes that must not receive HTML fallback, especially `/api`, `/static`, and potentially `/assets`. Workbox docs state denylist takes precedence over allowlist.
- Use a `/assets/` `CacheFirst` runtime route only for built Vite assets if they are not already fully precached. Vite build assets are hashed, so cache-first is compatible with immutable chunk URLs. Avoid catch handlers that turn asset failures into document HTML.
- If all hashed `/assets/**` files are already precached via Workbox `globPatterns`, an additional runtime `CacheFirst` route may be redundant; however, it preserves the current explicit `/assets/` caching pattern for assets not included in precache.
- Avoid a global runtime caching route for all same-origin GETs. The current general fallback only returns exact request matches and therefore does not cache arbitrary successful responses. A broad Workbox route could accidentally start storing `/static` user media or API-like resources if not carefully excluded.

### Avoid Caching `/static` User Media

User media exclusion is the main contract to preserve:

- `/static/uploads/**` and `/static/generated/**` are user-owned media URLs and are intentionally served with private revalidation headers (`apps/api/src/index.ts:325-326`, `apps/api/src/index.ts:938-942`).
- Do not include `/static/**` in `includeAssets`, Workbox `globPatterns`, or any `runtimeCaching` route.
- Add `/^\/static(?:\/|$)/` to `navigateFallbackDenylist` so direct navigation to a media URL does not get cached app-shell HTML when offline.
- Ensure any runtime `urlPattern` callback returns `false` for `url.pathname.startsWith('/static/')`.
- Do not use broad Workbox runtime patterns like `({ url }) => url.origin === self.location.origin` unless they explicitly exclude `/api/`, `/static/`, and non-asset paths.
- In local dev, `apps/web/vite.config.ts:16-19` proxies `/static` to the API. Plugin dev SW, if enabled, can intercept dev proxied `/static` URLs unless denied/excluded.
- Browser validation should inspect Cache Storage after loading gallery/result/upload images and confirm no request URL containing `/static/uploads/` or `/static/generated/` appears in Workbox precache or runtime caches.

### Validation Commands

Repository-level acceptance commands:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

Web-package focused commands:

```bash
pnpm --filter @dayu/web lint
pnpm --filter @dayu/web typecheck
pnpm --filter @dayu/web build
```

Expected build artifacts/checks after web build:

- Confirm `apps/web/dist/` contains generated service worker and registration asset(s), e.g. `sw.js`, `workbox-*.js`, and/or `registerSW.js` depending on plugin options.
- Confirm `apps/web/dist/manifest.webmanifest` or injected manifest output still contains the current app name, Chinese display values, `start_url`, `scope`, colors, and 192/512 icons.
- Confirm `apps/web/dist/index.html` contains the intended registration script if using plugin `injectRegister`, or confirm application bundle imports `virtual:pwa-register` if registering manually.

Manual browser/service-worker smoke checklist:

1. Serve a production build and open the app in a browser with a clean service worker/cache state.
2. Verify the service worker registers and controls the page.
3. Verify install affordance still appears when `beforeinstallprompt` fires; app remains usable if it never fires.
4. Load `/`, then switch offline and reload/navigate to app routes such as `/gallery`, `/queue`, `/history`; expect SPA shell fallback to render.
5. While offline, request a built asset URL under `/assets/`; it should come from cache if loaded before, and it must not return cached `/` HTML on asset miss.
6. Load pages/images that use `/static/uploads/...` or `/static/generated/...`; inspect Cache Storage and verify `/static` entries are absent.
7. While offline, direct navigation to a `/static/...` URL should not return the app shell HTML.
8. Verify `/api/**` requests are not served by the service worker cache.

Possible local serve command depends on available scripts; there is no current `preview` script in `apps/web/package.json`. Vite CLI can still be invoked through pnpm if needed after build, for example `pnpm --filter @dayu/web exec vite preview --host 127.0.0.1 --port 4173`, while the API runs separately for `/api` and `/static` behavior.

### Risks

- Broad runtime caching can accidentally cache `/static` user media; keep runtime routes narrow and denylist `/static` from navigation fallback.
- Removing manual `navigator.serviceWorker.register('/sw.js')` without enabling plugin registration (`injectRegister` or virtual module) would silently drop SW registration.
- Keeping manual registration while plugin also injects registration can double-register or create conflicting update behavior.
- Moving manifest generation into the plugin while leaving the old `<link rel="manifest" href="/manifest.webmanifest" />` can produce duplicate/conflicting manifest links if not coordinated.
- Current immediate update behavior (`skipWaiting`/`clients.claim`) can replace an active app while a user is mid-flow; this already exists, but `registerType: 'autoUpdate'` should be understood as preserving that update style.
- Workbox precache uses revisioned caches and may not keep the old cache name; browser smoke should validate behavior, not `dayu-avatar-shell-v2` cache presence.
- If `globPatterns` omits `html`, `js`, or `css`, Workbox may fail to precache required app shell resources.
- If generated SW remains named `/sw.js`, old clients can update in place; if the filename changes, old `public/sw.js` clients may continue until unregister/update behavior catches up.
- `eslint.config.mjs` and `apps/web/package.json` currently reference `public/sw.js`; migration may require aligning lint targets and service-worker-specific globals.
- `apps/web/src/vite-env.d.ts`/TS config may need PWA client types if the implementation imports `virtual:pwa-register`.

## Caveats / Not Found

- No active Trellis current task is set (`task.py current --source` returned none), so this report uses the explicit user-provided target task path.
- No existing `vite-plugin-pwa`, `workbox-*`, or `workbox-window` dependency was found in package files or lockfile.
- This research did not modify application code, package files, specs, or lockfile.
- External docs were searched through web search highlights; exact plugin option types should be verified against the installed `vite-plugin-pwa` version once a version is selected.
