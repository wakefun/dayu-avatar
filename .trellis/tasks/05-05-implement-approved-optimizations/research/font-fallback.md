# Research: Google Fonts preferred with self-hosted fallback

- **Query**: Research how to implement Google Fonts preferred with self-hosted fallback for `/home/wakefun/project/dayu-avatar` task `.trellis/tasks/05-05-implement-approved-optimizations`. Inspect current font usage in `apps/web`. Include 2-3 feasible approaches, repo constraints, files/assets that would change, and recommended low-risk implementation.
- **Scope**: mixed
- **Date**: 2026-05-05

## Findings

### Files Found

| File Path | Description |
|---|---|
| `apps/web/src/styles.css` | Only active font loading/theme location; imports Google Fonts and defines Tailwind v4 `--font-sans` / `--font-serif` tokens. |
| `apps/web/src/main.tsx` | Imports `./styles.css`, making the font import global for the React/Vite app. |
| `apps/web/src/components/AppShell.tsx` | Uses `font-serif` for the top-bar route title. |
| `apps/web/src/components/PageSection.tsx` | Uses `font-serif` for section titles. |
| `apps/web/src/pages/LoginPage.tsx` | Uses `font-serif` for the login page product title. |
| `apps/web/package.json` | Vite React app with Tailwind CSS v4; no existing font helper dependency. |
| `apps/web/vite.config.ts` | Vite config uses `@tailwindcss/vite` and React plugin only; no font plugin. |
| `apps/web/index.html` | Head has PWA/manifest/icon links only; no font preload/preconnect/link tags. |
| `apps/web/public/` | Contains PWA assets and `sw.js`; no font files found. |
| `.trellis/spec/frontend/component-guidelines.md` | Frontend styling contract: Tailwind utilities are primary; `src/styles.css` should stay limited to Tailwind import, theme tokens, and base globals. |
| `.trellis/tasks/05-05-implement-approved-optimizations/prd.md` | Requirement states Google Fonts remain preferred and self-hosted fonts are fallback only when Google Fonts cannot load. |

### Code Patterns

Current font loading is centralized in `apps/web/src/styles.css:1-6`:

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Noto+Serif+SC:wght@500;600;700&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: 'Manrope', 'PingFang SC', system-ui, sans-serif;
  --font-serif: 'Noto Serif SC', 'PingFang SC', serif;
}
```

Base body text uses the Tailwind theme token directly in `apps/web/src/styles.css:26-36`:

```css
body {
  margin: 0;
  min-height: 100vh;
  ...
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

Serif/display usage is limited and explicit:

| File Path | Lines | Pattern |
|---|---:|---|
| `apps/web/src/pages/LoginPage.tsx` | 21 | Login title uses `font-serif`. |
| `apps/web/src/components/AppShell.tsx` | 51 | Route title uses `font-serif`. |
| `apps/web/src/components/PageSection.tsx` | 14 | Section titles use `font-serif`. |

Focused searches found no existing local font assets (`*.woff2`, `*.woff`, `*.ttf`, `*.otf`) under `apps/web`, and no font helper dependencies such as `@fontsource/*`, `google-webfonts-helper`, `next/font`, or a Vite font plugin in the repo.

The Google Fonts CSS URL currently requests:

- `Manrope` weights `400`, `500`, `600`, `700`
- `Noto Serif SC` weights `500`, `600`, `700`
- `display=swap`

Fetching the CSS with a generic user agent returned `.ttf` font URLs. Fetching with a modern Chrome user agent returned `.woff2` URLs plus unicode-range-split rules, with very large output due to `Noto Serif SC` CJK subsets. This matters if local fallback tries to mirror Google exactly: CJK serif files/subsets can be large and more numerous than the current single `@import` line suggests.

### Feasible Approaches

#### Approach 1 — CSS-only preferred/fallback family names using duplicate font families

Keep the current Google `@import` as first choice, add local `@font-face` rules under different family names, and update Tailwind tokens so Google family names are before local fallback family names:

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Noto+Serif+SC:wght@500;600;700&display=swap');
@import "tailwindcss";

@font-face {
  font-family: 'Manrope Fallback';
  src: url('/fonts/manrope/Manrope-Variable.woff2') format('woff2');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Noto Serif SC Fallback';
  src: url('/fonts/noto-serif-sc/NotoSerifSC-VF.woff2') format('woff2');
  font-weight: 500 700;
  font-style: normal;
  font-display: swap;
}

@theme {
  --font-sans: 'Manrope', 'Manrope Fallback', 'PingFang SC', system-ui, sans-serif;
  --font-serif: 'Noto Serif SC', 'Noto Serif SC Fallback', 'PingFang SC', serif;
}
```

How it behaves:

- Browser resolves `font-family` in order.
- If Google CSS loads and its `@font-face` font activates, `Manrope` / `Noto Serif SC` are used.
- If Google CSS is blocked/unavailable and those family names have no active face, the browser proceeds to the local fallback family names and fetches `/fonts/...` from the app origin.

Files/assets likely changed:

- `apps/web/src/styles.css`: add local `@font-face` blocks and extend `--font-sans` / `--font-serif` stacks.
- `apps/web/public/fonts/...`: add self-hosted WOFF2 files.
- Optional: `apps/web/public/sw.js` or future Workbox config if fallback fonts should be cached for offline use; current hand-written SW cache-firsts only `/assets/`, not `/fonts/`.

Repo fit:

- Fits Vite + Tailwind CSS v4 CSS-first configuration.
- Keeps `styles.css` within the spec-approved role of Tailwind import, theme tokens, and base globals.
- Does not require new runtime code or dependency.
- Lowest risk for preserving “Google Fonts preferred” because the Google family names remain first.

Caveat:

- This is a network fallback by font-family resolution, not by detecting Google request failure in JavaScript.
- Local fallback font files must be chosen carefully. Mirroring `Noto Serif SC` exactly can add substantial CJK font weight unless subsetted.

#### Approach 2 — Preconnect/preload hints plus CSS fallback

Use Approach 1, and add Google preconnect hints to `apps/web/index.html` so Google remains clearly preferred and starts earlier:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

Optionally add local preload(s), but only if the local fallback is expected to be commonly used. Preloading fallback fonts while Google is still preferred can waste bandwidth by fetching local fonts even when Google works.

Files/assets likely changed:

- Same as Approach 1.
- `apps/web/index.html`: add `preconnect` links.

Repo fit:

- `index.html` currently has no font links and can accept standard head resource hints.
- This improves the preferred path without changing React code.

Caveat:

- Local fallback preload is not low-risk for performance because it competes with preferred Google font downloads.
- Preconnect helps Google but does not implement fallback by itself; it must be paired with local `@font-face` fallback stack.

#### Approach 3 — Dependency/tool-generated local fallback assets

Add a package or build-time step to manage local font CSS/assets, such as `@fontsource/manrope` and an available Noto Serif SC package, then import the local CSS under fallback family names or copy generated WOFF2 files to `public/fonts`.

Files/assets likely changed:

- `apps/web/package.json` / lockfile: add font packages or tooling.
- `apps/web/src/styles.css` or a new imported CSS file: import/generated fallback declarations.
- Possibly Vite config if a font plugin is chosen.

Repo fit:

- Could reduce manual asset handling for Latin font weights.
- Less aligned with the current dependency-light Vite/Tailwind setup.

Caveats:

- Font packages often define the original font-family names, which can invert the requirement by making self-hosted fonts compete with or replace Google rather than act as fallback. They may need custom family names or copied assets.
- Package availability/coverage for `Noto Serif SC` and exact weights/subsets must be confirmed before use.
- Adds dependency and lockfile churn for a small CSS/asset change.

### Repo Constraints

- The app is Vite React, not Next.js. `next/font/google` is documented as self-hosting Google Fonts automatically at build time, but it is not applicable without migrating frameworks.
- Tailwind CSS v4 is configured in CSS via `@theme`; current font utilities are generated from `--font-sans` and `--font-serif` in `apps/web/src/styles.css`.
- Frontend spec requires `src/styles.css` to remain limited to Tailwind import, theme tokens, and minimal base globals; font-face declarations and font theme tokens fit this boundary, but a large business stylesheet would not.
- Current public assets do not include fonts. Adding fallback means adding files under `apps/web/public/fonts/...` or importing assets through `src` so Vite emits them.
- Current hand-written service worker only cache-firsts `/assets/`; `public/fonts/...` served at `/fonts/...` would not get cache-first behavior unless SW/Workbox config includes them. The same task plans a Workbox/Vite PWA migration, so font caching should be coordinated there if offline fallback is desired.
- Requirements explicitly say Google Fonts should remain preferred and self-hosted fallback should only be used when Google Fonts cannot load. Avoid replacing the Google `@import` with local-only font loading.

### External References

- [Tailwind CSS font-family docs](https://tailwindcss.com/docs/font-family) — Tailwind v4 uses `--font-*` theme variables for font utilities; Google `@import` must be at the top of CSS; `@font-face` can be used for custom fonts with `font-display: swap`.
- [MDN `@font-face`](https://developer.mozilla.org/Web/CSS/@font-face) — `@font-face` can load remote or local font resources; `local()` and `url()` are common; WOFF2 is generally best for modern web delivery.
- [MDN `@font-face src` descriptor](https://developer.mozilla.org/en-US/docs/Web/CSS/%40font-face/src) — browser tries `src` entries in declared order for a font face; for fallback across font families, order the `font-family` stack by preference.
- [web.dev self-hosted font best practices](https://web.dev/patterns/web-vitals-patterns/fonts/font-self-hosted) — self-hosting requires attention to CDN/HTTP2, WOFF2 compression, subsetting, and `font-display`; CJK font optimization can be challenging.
- [Next.js font optimization docs](https://nextjs.org/docs/app/getting-started/fonts) — `next/font` self-hosts Google Fonts at build time, but this repo is Vite/React, so this is reference-only rather than a direct implementation path.

### Recommended Low-Risk Implementation

Use Approach 1, optionally with only Google preconnect from Approach 2:

1. Keep the existing Google Fonts `@import` at the top of `apps/web/src/styles.css` unchanged so Google remains the primary source.
2. Add local fallback `@font-face` declarations with different family names, e.g. `Manrope Fallback` and `Noto Serif SC Fallback`, pointing to WOFF2 files in `apps/web/public/fonts/...`.
3. Update Tailwind theme font stacks to place Google first, local fallback second, then current system/CJK fallbacks:
   - `--font-sans: 'Manrope', 'Manrope Fallback', 'PingFang SC', system-ui, sans-serif;`
   - `--font-serif: 'Noto Serif SC', 'Noto Serif SC Fallback', 'PingFang SC', serif;`
4. Use only the currently requested weights:
   - Manrope: `400`, `500`, `600`, `700` (or a variable WOFF2 covering `400 700`).
   - Noto Serif SC: `500`, `600`, `700` (or a variable/subset WOFF2 covering `500 700`).
5. Coordinate PWA caching in the Workbox migration if `/fonts/` should be available offline/cache-first; do not expand the current handwritten SW separately unless the PWA migration is deferred.

Reasoning:

- Minimal code surface: one CSS file plus static font assets.
- No React/component changes required because existing `font-sans`, `font-serif`, and body font-family usage already route through Tailwind theme variables.
- Preserves visual design whenever Google Fonts load.
- Local fallback activates only when the preferred Google family is unavailable.

### Related Specs

- `.trellis/spec/frontend/component-guidelines.md` — `apps/web` should use Tailwind utilities, keep `src/styles.css` limited to Tailwind import/theme/base globals, and use CSS variables/Tailwind theme tokens for shared fonts.

## Caveats / Not Found

- No local font files currently exist under `apps/web`.
- No exact local fallback asset source was selected during research; implementation must choose/download/license WOFF2 assets for Manrope and Noto Serif SC, preferably subsetted for actual app language coverage.
- Google Fonts CSS for `Noto Serif SC` is large with many unicode ranges for modern browsers; exact self-host mirroring can add significant asset size. A narrower fallback subset is lower size but may not cover all possible Chinese text.
- The current service worker does not cache `/fonts/`; Workbox migration in the same task is the better place to add font runtime caching if required.
