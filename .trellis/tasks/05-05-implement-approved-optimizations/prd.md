# implement-approved-optimizations

## Goal

Implement the user-approved optimization items from the project audit: keep Google Fonts as the preferred font source with self-hosted fallback when unavailable, replace polling-based task updates with server-sent real-time updates, and migrate the hand-written PWA service worker to a Workbox/Vite PWA plugin setup.

## Requirements

* Keep rejected items out of implementation: no authenticated/signed media URLs, no enforcing CSP, no automated browser test/CI setup.
* Prefer Google Fonts at runtime and provide self-hosted fallback families only when the Google-hosted families cannot load.
* Replace Loading and Queue page fixed polling loops with authenticated Server-Sent Events streams while preserving existing routes, UI states, and REST response shapes.
* Keep existing REST task/queue endpoints for direct loads, retries, result checks, and fallback compatibility.
* Migrate the service worker from `apps/web/public/sw.js` to Workbox via `vite-plugin-pwa` generated SW registration.
* Preserve PWA behavior: navigation fallback to `/`, built asset caching, manifest/icon availability, and no caching of `/static/uploads/**` or `/static/generated/**` user media.
* Update code-specs for any new realtime/PWA/font contracts established by implementation.

## Acceptance Criteria

* [ ] Font behavior keeps Google Fonts as first choice and has a self-hosted fallback path.
* [ ] Loading and queue pages receive task updates without their current fixed polling loops.
* [ ] SSE endpoints preserve session-cookie auth, user ownership checks, and existing task/queue payload shapes.
* [ ] PWA build uses Workbox/Vite PWA plugin and preserves navigation fallback/static asset behavior.
* [ ] PWA runtime caching does not include `/static` user media.
* [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.
* [ ] Browser smoke covers login/reachability and the updated loading/queue/PWA behavior as far as local env allows.
* [ ] Rejected items remain untouched.

## Definition of Done

* Lint/typecheck/build pass.
* Browser smoke is attempted and limitations recorded.
* Specs updated for new real-time, PWA, and font fallback contracts.
* Code committed and Trellis task finished.

## Technical Approach

* **Fonts**: keep the existing Google Fonts `@import` first, add local `@font-face` declarations under distinct fallback family names, and update Tailwind `--font-sans` / `--font-serif` stacks so Google families remain first.
* **Realtime**: use SSE rather than WebSocket because updates are server-to-client only and Express can stream authenticated `GET` responses without new WebSocket dependencies or upgrade/session wiring.
* **PWA**: add `vite-plugin-pwa` with Workbox `generateSW`, use plugin-injected registration, preserve manifest metadata/icons, add narrow `/assets/` caching, configure SPA navigation fallback, and denylist `/api`, `/static`, and `/assets` from app-shell navigation fallback.

## Decision (ADR-lite)

**Context**: The approved optimizations touch frontend, backend, and PWA infrastructure. The implementation must improve offline/realtime/font resilience without adding rejected security redesigns or CI/browser automation.

**Decision**: Use CSS fallback family ordering for fonts, SSE for realtime task/queue snapshots, and `vite-plugin-pwa` Workbox `generateSW` for service worker generation.

**Consequences**: This minimizes new runtime complexity and preserves existing UX/API contracts. SSE still needs server-side cadence because mock task progress currently advances when task sync functions run. Workbox cache behavior must be kept narrow to avoid storing user media.

## Out of Scope

* Authenticated or signed media URL redesign.
* Enforcing CSP.
* Adding automated browser tests or CI workflows.
* Large visual redesign or new font choice beyond fallback behavior.
* Replacing Express/React app architecture.
* WebSocket protocol or bidirectional realtime messaging.

## Research References

* [`research/font-fallback.md`](research/font-fallback.md) — recommends keeping Google Fonts preferred and adding separate local fallback family names/assets.
* [`research/realtime-approach.md`](research/realtime-approach.md) — recommends SSE over WebSocket for authenticated server-to-client task/queue updates.
* [`research/pwa-plugin-migration.md`](research/pwa-plugin-migration.md) — maps the current hand-written service worker behavior to `vite-plugin-pwa`/Workbox configuration.

## Technical Notes

* Current app is a pnpm workspace with `apps/api` Express backend and `apps/web` React/Vite frontend.
* The user rejected authenticated/signed media URLs, enforcing CSP, and adding automated browser tests/CI for this round.
* For fonts, Google Fonts should remain preferred; self-hosted fonts are fallback only when Google Fonts cannot load.
* PWA migration should preserve the current offline shell behavior: navigation fallback to `/`, static asset caching, manifest icons, and no caching of user media.

## Verification Notes

* `pnpm typecheck` passed.
* `pnpm lint` passed.
* `pnpm build` passed and generated `apps/web/dist/sw.js`, `apps/web/dist/workbox-*.js`, `apps/web/dist/registerSW.js`, and a complete `manifest.webmanifest` with `lang: "zh-CN"`.
* Generated Workbox SW deny-lists `/api`, `/static`, and `/assets` from navigation fallback and only runtime-cache-firsts same-origin `/assets/**`.
* `curl -i -N --max-time 3 http://localhost:3001/api/queue/events` returned JSON `401 UNAUTHORIZED` before SSE headers for unauthenticated access.
* Full mock-login/generation SSE smoke was blocked by pre-existing local API processes / `.env` OIDC configuration on port 3001; no destructive process cleanup was performed.
