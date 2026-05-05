# Apply Approved PWA and Config Improvements

## Goal

Implement the previously deferred and now-approved PWA/config improvements from the project audit: robust PWA asset caching, correct PWA icon assets/manifest metadata, lint coverage for the service worker, env-aligned Vite proxy config, and duplicate logo cleanup.

## Requirements

* Add robust non-HTML caching for built Vite assets so offline reloads do not fail after serving cached app shell HTML.
* Add explicit PWA icon assets for 192x192 and 512x512 and update `manifest.webmanifest` to reference correct icon sizes/metadata.
* Keep `/logo.png` available for favicon/apple-touch-icon and existing app shell references unless a safe replacement is made.
* Include `apps/web/public/sw.js` in lint coverage with appropriate service-worker globals instead of letting PWA regressions bypass lint.
* Make Vite dev proxy derive the API target from the same root `.env`/default `PORT` contract used by the API, without reading or printing secrets.
* Remove the duplicate tracked logo file outside Vite `public/` if confirmed unused.
* Run lint, typecheck, build, and practical smoke checks.
* Commit verified changes.

## Acceptance Criteria

* [x] `apps/web/public/sw.js` caches `/assets/` responses safely and still uses `/` fallback only for navigation requests.
* [x] `apps/web/public/manifest.webmanifest` declares valid 192x192 and 512x512 icons whose files exist under `apps/web/public/`.
* [x] `pnpm --filter @dayu/web lint` includes `public/sw.js` and passes.
* [x] Vite proxy target uses the API port from root env/default instead of hard-coded `3001` only.
* [x] Duplicate `apps/web/logo.png` is removed only after confirming app-facing references use `apps/web/public/logo.png`.
* [x] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.
* [x] Git diff is reviewed and a new commit is created.

## Definition of Done

* Safe non-destructive improvements are implemented and verified.
* Code-specs are updated if new PWA/config contracts are established.
* Working tree is clean after commit.

## Technical Approach

1. Use the prior config audit as the implementation guide.
2. Keep manual service worker approach; do not introduce new PWA dependencies unless necessary.
3. Generate deterministic icon PNGs from the existing public logo using local tooling already available in the repo/runtime.
4. Use a small Vite config helper to load the root `.env` enough to read `PORT` only, preserving the API precedence rule.
5. Extend ESLint config/script minimally for service worker globals.
6. Verify and commit.

## Decision (ADR-lite)

**Context**: The user approved all deferred audit recommendations after the previous safe-fix commit.

**Decision**: Implement the remaining improvements directly in the existing tooling: manual runtime caching in `sw.js`, generated public icon assets, lint coverage for the service worker, root env-aware Vite proxy, and duplicate logo deletion.

**Consequences**: This avoids adding Workbox/Vite PWA dependencies now, but manual service worker behavior must remain covered by lint and smoke checks.

## Out of Scope

* Adding new PWA libraries or changing the app routing model.
* Real PWA install audits in external browsers beyond local build/smoke checks.
* Changing API runtime behavior except reading the existing `PORT` contract from Vite config.

## Research References

* `../05-05-audit-fix-project-issues/research/config-audit.md` — source of approved PWA/config findings.

## Technical Notes

* Relevant specs: `.trellis/spec/frontend/directory-structure.md`, `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/backend/directory-structure.md`, `.trellis/spec/backend/error-handling.md`.
* Prior audit commit: `35d5e77 fix: harden avatar app audit findings`.
