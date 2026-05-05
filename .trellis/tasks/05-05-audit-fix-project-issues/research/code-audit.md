# Research: code audit

- **Query**: Audit likely bugs and safe low-risk improvements in app source for `.trellis/tasks/05-05-audit-fix-project-issues`, especially React/TypeScript/Vite frontend; persist findings to `research/code-audit.md`.
- **Scope**: internal
- **Date**: 2026-05-05

## Findings

### Files Found

| File Path | Description |
|---|---|
| `apps/web/src/App.tsx` | SPA auth/session refresh, route wiring, PWA install prompt handling |
| `apps/web/src/lib/api.ts` | Typed frontend API wrapper and upload request helper |
| `apps/web/src/pages/GeneratePage.tsx` | Upload flow, prompt/style controls, task creation, size normalization |
| `apps/web/src/pages/LoadingPage.tsx` | Task polling/loading UI |
| `apps/web/src/pages/QueuePage.tsx` | Queue polling and queue-card navigation |
| `apps/web/src/pages/HistoryPage.tsx` | History data load and regenerate prefill navigation |
| `apps/web/src/pages/GalleryPage.tsx` | Gallery data load and lightbox actions |
| `apps/web/src/pages/ResultPage.tsx` | Result load, save/download/regenerate actions |
| `apps/web/src/pages/SettingsPage.tsx` | Logout action and provider redirect handling |
| `apps/web/src/components/UploadCard.tsx` | Reference-image input, preview, add/remove UI |
| `apps/web/public/sw.js` | PWA service worker cache/fetch strategy |
| `apps/api/src/index.ts` | Express API, auth/session routes, uploads, generation, gallery routes |
| `.trellis/spec/frontend/component-guidelines.md` | Frontend UI contracts for drawer, upload, lightbox, gallery/result behavior |
| `.trellis/spec/frontend/type-safety.md` | Frontend API boundary/type contracts |
| `.trellis/spec/backend/error-handling.md` | Auth, upload, OpenAI, PWA, queue/history/gallery contracts |

### Code Patterns

#### 1. High — mock login endpoint remains available when `AUTH_MODE=oidc`

- **Location**: `apps/api/src/index.ts:430-448`
- **Related contrast**: `GET /api/auth/login` respects `authMode` at `apps/api/src/index.ts:353-361`, but `POST /api/auth/mock-login` has no equivalent guard.
- **Why this is a bug**: In an OIDC deployment, a direct `POST /api/auth/mock-login` can still create a local mock session, bypassing the intended unified login path.
- **Safe/non-destructive fix**: Yes. Gate the mock-login route with `authMode === 'mock'` and return a safe error otherwise. This preserves local mock mode and only disables the bypass when OIDC is configured.

#### 2. Medium — failed/canceled queue items open a loading page that never treats them as terminal

- **Location**: `apps/web/src/pages/QueuePage.tsx:30-37`, `apps/web/src/pages/LoadingPage.tsx:25-28`, `apps/web/src/pages/LoadingPage.tsx:36-43`, `apps/web/src/pages/LoadingPage.tsx:48-58`
- **Why this is a bug**: `QueuePage` sends every non-`completed` status, including `failed` and `canceled`, to `/generate/loading/:taskId`. `LoadingPage` only navigates on `completed`; failed/canceled tasks keep the polling interval and display processing copy/progress indefinitely.
- **Safe/non-destructive fix**: Yes. Treat `failed` and `canceled` as terminal in `LoadingPage` and show the task error/canceled state with a queue/regenerate CTA, or route those statuses differently from `QueuePage`.

#### 3. Medium — upload helper can throw JSON parse errors for non-JSON upload failures

- **Location**: `apps/web/src/lib/api.ts:53-56`
- **Related contrast**: generic `request<T>` checks `content-type` before parsing JSON at `apps/web/src/lib/api.ts:22-27`.
- **Why this is a bug**: Upload failures from multer limits, reverse proxies, or server errors may return HTML/plain text instead of JSON. `await response.json()` then throws a parse error before the intended `'上传失败'` fallback can run.
- **Safe/non-destructive fix**: Yes. Reuse the generic response parsing pattern for upload responses: parse JSON only for JSON content types and fall back to a friendly message for other bodies.

#### 4. Medium — upload UI and backend allow broader/spoofed image types than the product copy promises

- **Location**: `apps/web/src/components/UploadCard.tsx:46-48`, `apps/web/src/components/UploadCard.tsx:84`, `apps/api/src/index.ts:506-511`, `apps/api/src/index.ts:1161-1179`
- **Why this is a bug**: The UI says “支持 PNG / JPG / WEBP” but the file inputs use `accept="image/*"`; the backend accepts any client-supplied MIME starting with `image/` and derives the stored extension from the user-controlled original filename before serving files under `/static/uploads`. Unsupported or spoofed image types can break previews/provider calls, and SVG-style uploads are avoidable risk for a static upload route.
- **Safe/non-destructive fix**: Yes. Restrict frontend `accept` to PNG/JPEG/WEBP and backend validation to the same set; derive the stored extension from validated MIME or detected magic bytes instead of `file.originalname`.

#### 5. Medium/Low — service worker offline fallback can return HTML for JS/CSS asset requests

- **Location**: `apps/web/public/sw.js:0-4`, `apps/web/public/sw.js:17-23`
- **Why this is a bug**: The install step caches only `/`, `/manifest.webmanifest`, and `/logo.png`. The fetch handler falls back to `caches.match('/')` for any non-API GET request. In a built Vite app, offline requests for `/assets/*.js` or `/assets/*.css` are not precached and can receive cached HTML as a fallback, causing module/CSS load failures.
- **Safe/non-destructive fix**: Yes. Only use the `/` fallback for navigation requests, and either runtime-cache static assets or precache the built Vite assets with a manifest/PWA plugin.

#### 6. Low — a single optional style reference image cannot be cleared directly

- **Location**: `apps/web/src/components/UploadCard.tsx:64-73`, `apps/web/src/pages/GeneratePage.tsx:164-174`, `apps/api/src/index.ts:529-530`
- **Why this is a bug**: Style references are optional (`styleReferenceAssetIds` may be empty), but `UploadCard` only renders the remove button when `values.length > 1`. After uploading exactly one style reference, the user cannot remove it directly without adding another image or resetting the page.
- **Safe/non-destructive fix**: Yes. Render the remove action for every uploaded image, or add an explicit clear action for optional style-reference cards.

#### 7. Low — several page/action async calls have no local error handling

- **Location**: `apps/web/src/pages/HistoryPage.tsx:14-18`, `apps/web/src/pages/QueuePage.tsx:12-22`, `apps/web/src/pages/GalleryPage.tsx:18-31`, `apps/web/src/pages/ResultPage.tsx:63-65`, `apps/web/src/pages/GalleryPage.tsx:67-84`, `apps/web/src/pages/SettingsPage.tsx:43-50`
- **Why this is a bug**: Network failures or session expiry can produce unhandled promise rejections or leave stale UI with no user-visible error. This is most visible in polling pages and lightbox actions.
- **Safe/non-destructive fix**: Yes, if kept surgical. Add per-page `error` state/catch handlers for existing async loads/actions without changing API contracts or broader state management.

### Validation Observations

- `pnpm --filter @dayu/web typecheck` passed.
- `pnpm --filter @dayu/web lint` passed.
- `pnpm --filter @dayu/api typecheck` passed.
- `pnpm --filter @dayu/api lint` passed.
- No `TODO`, `FIXME`, `dangerouslySetInnerHTML`, `innerHTML`, `localStorage`, or `sessionStorage` usage was found in `apps/web/src` / `apps/api/src` during grep-based inspection.

### External References

- None used. This audit was based on internal source/spec inspection only.

### Related Specs

- `.trellis/spec/frontend/directory-structure.md` — confirms route/API/type module responsibilities and frontend validation commands.
- `.trellis/spec/frontend/component-guidelines.md` — confirms upload, queue/history/gallery/result, PWA install affordance, and lightbox behavior contracts.
- `.trellis/spec/frontend/type-safety.md` — confirms frontend task/history/gallery API boundary contracts.
- `.trellis/spec/backend/error-handling.md` — confirms OIDC/mock auth, OpenAI-compatible generation, upload/reference validation, PWA, and queue/history/gallery API contracts.

## Caveats / Not Found

- This was a read-only code inspection except writing this research file. No source files were modified.
- `pnpm --filter @dayu/web build` and browser smoke tests were not run because they can write build artifacts and the requested role was read-only inspection.
- Real OIDC/OpenAI flows were not exercised because valid external credentials/environment are required.
- The findings above are likely-bug/safe-fix candidates; implementation should still review each exact diff before committing.
