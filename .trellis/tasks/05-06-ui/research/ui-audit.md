# Research: UI Audit

- **Query**: Audit Dayu Avatar mobile web UI polish issues for login, generation home, queue, history, gallery, settings, result/lightbox if reachable; identify concrete actionable class-level fixes without editing product code.
- **Scope**: mixed browser/source inspection
- **Date**: 2026-05-06

## Findings

### Pages Checked / Blockers

- Browser smoke check: `http://localhost:5173` returned `502` through the local proxy path, but direct Vite IPv6 access at `http://[::1]:5173` returned `200`.
- Browser screenshot checked: `/login` at a 390×844 mobile-sized Chromium viewport.
- Authenticated routes were not fully browser-reachable because `.env` has `AUTH_MODE=oidc` and `POST /api/auth/mock-login` returns `当前环境未启用模拟登录`. Source inspection was used for generation home, queue, history, gallery, settings, loading/result, and lightbox.

### Files Found

| File Path | Description |
|---|---|
| `apps/web/src/App.tsx` | Route wiring and auth redirects for login, generation, gallery, queue, history, settings, loading, result. |
| `apps/web/src/components/AppShell.tsx` | Mobile max-width shell, sticky top nav, side drawer, overlay, install action. |
| `apps/web/src/components/ui.ts` | Shared Tailwind class recipes for glass panels, page stack, cards, buttons, fields. |
| `apps/web/src/components/PageSection.tsx` | Shared glass section wrapper and title/subtitle rhythm. |
| `apps/web/src/components/UploadCard.tsx` | Reference upload card, square image grid, add overlay, remove buttons. |
| `apps/web/src/components/Cards.tsx` | Queue, history, and gallery cards. |
| `apps/web/src/components/ImageLightbox.tsx` | Fullscreen preview dialog and footer actions. |
| `apps/web/src/pages/LoginPage.tsx` | Login screen. |
| `apps/web/src/pages/GeneratePage.tsx` | Generation home form and settings. |
| `apps/web/src/pages/QueuePage.tsx` | Queue list page. |
| `apps/web/src/pages/HistoryPage.tsx` | History list page. |
| `apps/web/src/pages/GalleryPage.tsx` | Gallery masonry and gallery empty state. |
| `apps/web/src/pages/SettingsPage.tsx` | Account/session settings page. |
| `apps/web/src/pages/LoadingPage.tsx` | Task progress and terminal failure/canceled states. |
| `apps/web/src/pages/ResultPage.tsx` | Result preview, save/download/regenerate/gallery actions, generation parameters. |

### Code Patterns

1. **Login mobile clipping / overly wide centered card**
   - Evidence: headless Chromium screenshot of `/login` at 390×844 showed the glass card content/button visually running to the right viewport edge instead of breathing evenly.
   - Likely responsible: `LoginPage.tsx:18-19` uses `grid min-h-screen place-items-center px-6` and an inner `max-w-[430px] p-7` card.
   - Suggested class-level fix: use a stricter mobile-safe width and less aggressive padding, e.g. outer `min-h-[100svh] overflow-x-hidden px-4` and inner `max-w-[calc(100vw-32px)] p-6 sm:p-7`.

2. **Queue empty state is visually blank**
   - Evidence: `QueuePage.tsx:31-43` always renders the list wrapper and maps `items`; when empty, the section contains only heading/subtitle and blank space.
   - Suggested class-level fix: render a `softCardClass` empty card with `grid gap-2.5 text-center py-6` and helper copy/CTA when `items.length === 0`.

3. **History empty state is visually blank**
   - Evidence: `HistoryPage.tsx:23-44` mirrors the queue list pattern and has no empty state branch.
   - Suggested class-level fix: add the same `softCardClass` empty treatment, with a full-width secondary/primary CTA back to generation.

4. **History cards without result thumbnails collapse text into a narrow first column**
   - Evidence: `Cards.tsx:60-76` uses `grid-cols-[86px_1fr]` even when `item.resultImageUrl` is absent; with no image child, the text block auto-places into the 86px column.
   - Suggested class-level fix: make the grid conditional: thumbnail present -> `grid-cols-[86px_1fr]`; no thumbnail -> `grid-cols-1`, or render an 86px placeholder tile.

5. **Remove-image touch target is smaller than standard mobile tap size**
   - Evidence: `UploadCard.tsx:66-69` sets the remove control to `h-[30px] w-[30px]`.
   - Suggested class-level fix: keep the small visual circle if desired but expand the interactive target to at least 44px, e.g. `h-11 w-11` or `after:absolute after:-inset-2` with `relative`.

6. **Lightbox close target is slightly undersized and footer can become tight on short screens**
   - Evidence: `ImageLightbox.tsx:47-58` uses a full-screen dialog with close button `h-10 w-10`; gallery preview can show meta plus four footer actions from `GalleryPage.tsx:64-88`.
   - Suggested class-level fix: use `h-11 w-11`, add `overflow-y-auto` to the inner container, and cap image height a bit lower when actions exist, e.g. conditional `max-h-[68vh]`.

7. **Drawer ignores mobile safe-area bottom/top and cannot scroll**
   - Evidence: `AppShell.tsx:77-80` uses `fixed inset-y-4 left-4 ... p-[18px]` with no `overflow-y-auto`.
   - Suggested class-level fix: replace with safe-area-aware offsets such as `top-[max(16px,env(safe-area-inset-top))] bottom-[max(16px,env(safe-area-inset-bottom))] overflow-y-auto`.

8. **Queue/history card headers can compress on narrow screens**
   - Evidence: `Cards.tsx:25-28` and `Cards.tsx:56-58` use one-line `flex items-center justify-between` for status pill plus localized timestamp.
   - Suggested class-level fix: use `flex-wrap` or a two-row mobile layout (`grid gap-1.5`) with timestamp `text-right leading-5 shrink-0` so long dates do not squeeze status/content.

### What Already Looks Good / Should Not Change

- `AppShell.tsx:31-63` keeps the requested top nav + side drawer direction, not bottom tabs.
- `ui.ts:4-15` centralizes warm white/glass panels and shared button recipes.
- `GalleryPage.tsx:45-50` and `Cards.tsx:87-112` keep gallery cards image-only, matching the spec direction.
- `ResultPage.tsx:61-66` preserves result aspect ratio with `object-contain`, and `ImageLightbox.tsx:64-68` also uses native dimensions when available.
- `ImageLightbox.tsx:26-40` focuses the close button and supports Escape close.

### External References

- None used; this was an internal/browser UI polish audit.

### Related Specs

- `.trellis/spec/frontend/component-guidelines.md` — confirms warm-white glass/gallery cards, top navigation plus side drawer, no bottom tabs, image-only gallery cards, fullscreen previews, and reachable preview footer actions.
- `.trellis/spec/frontend/directory-structure.md` — confirms `apps/web` route/component organization and browser smoke-test expectations.

## Caveats / Not Found

- Could not inspect authenticated pages in live browser state because OIDC login was required and mock login was disabled.
- Result/lightbox was inspected from source only; no completed task result was reached in browser.
- No product code was edited and no git operations were run.
