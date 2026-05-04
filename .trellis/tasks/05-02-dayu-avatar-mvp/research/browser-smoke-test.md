# Research: browser-smoke-test

- **Query**: Perform a browser-level smoke test for the Dayu Avatar MVP in /home/wakefun/project/dayu-avatar. Verify login, mock login, navigation, generation UI, queue/history/gallery/settings reachability, and exercise upload/generation if practical.
- **Scope**: internal
- **Date**: 2026-05-02

## Findings

### Files Found

| File Path | Description |
|---|---|
| `apps/web/src/App.tsx` | App routing, auth gate, login redirect, shell mount, page routes. |
| `apps/web/src/components/AppShell.tsx` | Top bar and side drawer navigation for the main pages. |
| `apps/web/src/pages/LoginPage.tsx` | Mock login button labeled `使用大宇统一登录`. |
| `apps/web/src/pages/GeneratePage.tsx` | Generation page with upload controls, prompt textarea, style tags, model/quality/size fields, and submit action. |
| `apps/web/src/pages/LoadingPage.tsx` | Polling loading screen that redirects to result page when task completes. |
| `apps/web/src/pages/ResultPage.tsx` | Result image, save-to-gallery, download, retry, and navigate-to-gallery actions. |
| `apps/web/src/pages/GalleryPage.tsx` | Gallery list / empty state and reload after save/favorite/delete. |
| `apps/web/src/pages/QueuePage.tsx` | Queue page with polling and open/retry actions. |
| `apps/web/src/pages/HistoryPage.tsx` | History page listing past generations and retry action. |
| `apps/web/src/pages/SettingsPage.tsx` | Settings page showing current user and logout. |
| `apps/web/src/lib/api.ts` | Frontend API layer for auth, uploads, generation tasks, queue/history/gallery. |
| `apps/api/src/index.ts` | Express API providing mock auth, upload, task progression, results, gallery, and download endpoints. |
| `.trellis/spec/frontend/index.md` | Frontend spec index; currently template content only. |
| `.trellis/spec/frontend/directory-structure.md` | Frontend directory-structure spec; currently placeholder content only. |
| `.trellis/spec/frontend/quality-guidelines.md` | Frontend quality spec; currently placeholder content only. |

### Code Patterns

- Auth bootstrap checks `/api/auth/me` and redirects unauthenticated users to `/login` before rendering the app shell: `apps/web/src/App.tsx:29-46`, `apps/web/src/App.tsx:62-84`.
- Login page triggers mock auth via `api.mockLogin('大宇体验用户')` and navigates to `/` on success: `apps/web/src/pages/LoginPage.tsx:23-42`.
- Main navigation is drawer-based, with entries for generate, gallery, queue, history, and settings: `apps/web/src/components/AppShell.tsx:13-19`, `apps/web/src/components/AppShell.tsx:46-58`.
- Generation page exposes two image uploads, prompt textarea, style-tag chips, generation params, and submit button: `apps/web/src/pages/GeneratePage.tsx:67-89`, `apps/web/src/pages/GeneratePage.tsx:92-148`.
- Uploads are practical in browser because the file inputs are plain `<input type="file" accept="image/*">` controls: `apps/web/src/components/UploadCard.tsx:15-24`.
- Generation flow is practical in browser because the frontend creates a task then polls until completion and redirects to the result page: `apps/web/src/pages/GeneratePage.tsx:124-145`, `apps/web/src/pages/LoadingPage.tsx:14-42`, `apps/api/src/index.ts:915-947`.
- Result page can save a completed generation into gallery and offers download/retry actions: `apps/web/src/pages/ResultPage.tsx:37-74`.
- API seeds demo data for a newly logged-in mock user and auto-completes new tasks after timed checkpoints: `apps/api/src/index.ts:815-879`, `apps/api/src/index.ts:921-947`.

### Browser Smoke Test Results

Environment used:
- Headless Chromium via remote debugging/CDP because no dedicated browser/devtools MCP tool was present.
- Requests to `localhost` required proxy bypass (`--noproxy '*'` / `--no-proxy-server`) because the shell environment had an HTTP proxy that returned `502` for `http://localhost:5173`.

Observed test results:

| Scenario | Result | Evidence |
|---|---|---|
| Login page renders | Pass | `/login` showed heading `大宇头像` and button `使用大宇统一登录`. |
| Mock login works | Pass | Clicking `使用大宇统一登录` navigated to `/`. |
| Top menu / side drawer navigation works | Pass | Drawer navigation reached `/`, `/gallery`, `/queue`, `/history`, `/settings`. |
| Generation page visible | Pass | Two file inputs, prompt textarea, tag chips, quality/size selects, and model field were present. |
| Queue page reachable | Pass | `/queue` rendered task list page. |
| History page reachable | Pass | `/history` rendered history list page. |
| Gallery page reachable | Pass | `/gallery` rendered and later showed saved item after reload. |
| Settings page reachable | Pass | `/settings` rendered current-user/settings UI. |
| Upload practical | Pass | Personal and style reference uploads both accepted image files and rendered previews. |
| Generation practical | Pass | New task `task_118164d712899017` progressed from loading to result page. |
| Save result to gallery | Pass with caveat | Save action succeeded; SQLite confirmed gallery row creation; gallery UI showed the item after waiting for async reload. |

### Console / Runtime Errors

- Browser runtime/network log recorded one missing asset error:
  - `http://localhost:5173/favicon.ico` returned `404 Not Found`.
- No frontend console errors were captured during login, navigation, upload, generation, result, or save-to-gallery actions.
- No blocking runtime exceptions were captured in the app itself.

### Data / Runtime Evidence

- Smoke test created and completed task `task_118164d712899017`.
- Gallery save was confirmed in SQLite (`gallery_items`) for that task's result.
- Existing runtime data under `data/` was updated through normal app use only.

### External References

- None used.

### Related Specs

- `.trellis/spec/frontend/index.md` — frontend documentation index.
- `.trellis/spec/frontend/directory-structure.md` — placeholder frontend structure spec.
- `.trellis/spec/frontend/quality-guidelines.md` — placeholder frontend quality spec.

## Caveats / Not Found

- No dedicated browser/devtools MCP tool was available, so the smoke test was executed with headless Chromium plus the Chrome DevTools Protocol.
- The shell's proxy environment caused `curl http://localhost:5173` to fail with `502 Bad Gateway` unless localhost proxy bypass was used.
- Immediately after clicking `前往图库` from the result page, the gallery briefly still showed the empty state; after a short wait the saved gallery card appeared. This matches the page's async `load()` behavior in `apps/web/src/pages/GalleryPage.tsx:11-18`.
- The frontend spec files found under `.trellis/spec/frontend/` are templates/placeholders and did not add project-specific testing conventions.
