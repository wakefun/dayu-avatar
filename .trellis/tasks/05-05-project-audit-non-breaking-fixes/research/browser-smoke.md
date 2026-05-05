# Research: Browser Smoke Test

- **Query**: Chrome DevTools smoke-test for `.trellis/tasks/05-05-project-audit-non-breaking-fixes` golden path in mock mode where feasible.
- **Scope**: browser/runtime smoke test
- **Date**: 2026-05-05

## Environment

- App URL: `http://localhost:5173`
- API URL: `http://localhost:3001`
- Browser: Chromium headless via Chrome DevTools Protocol (`Chrome/147.0.7727.116`)
- API health: `GET /api/health` returned `{"ok":true}`

## Findings

| Check | Status | Notes |
|---|---:|---|
| Real app unauthenticated load | PASS | App loaded at `http://localhost:5173/login` and displayed the login page (`大宇头像`, `使用大宇统一登录`). |
| Real mock-login endpoint | WARN | `POST /api/auth/mock-login` returned HTTP 400 with `当前环境未启用模拟登录`; the running API is not in mock auth mode. |
| Real login button behavior | WARN | Clicking `使用大宇统一登录` navigated to `https://friends.chenyu.cy/sign-in?app_id=...`; interactive OIDC credentials were not available, so real authenticated golden path could not proceed. |
| Authenticated shell load with DevTools-mocked API | PASS | Mocked `/api/auth/me` loaded `/` with title `头像生成`. |
| Drawer navigation | PASS | Drawer showed `头像生成`, `我的图库`, `任务队列`, `历史记录`, `账户设置`. |
| Install state | PASS with caveat | In the DevTools-mocked browser, the install button rendered as enabled (`添加到桌面`) because a `beforeinstallprompt` event was available; this verifies the available state, not the disabled state. |
| Queue reachability | PASS | `/queue` loaded and displayed completed, failed, canceled, and processing tasks under mocked API responses. |
| History reachability | PASS | `/history` loaded and displayed task history plus `再次生成` actions under mocked API responses. |
| Settings reachability | PASS | `/settings` loaded and displayed mocked user/session info including `模拟登录体验模式`. |
| Gallery reachability | PASS | `/gallery` loaded and displayed empty-gallery state plus `去生成第一个头像`. |
| Generation controls visible | PASS | Generate page showed upload controls, prompt textarea, style chips, ratio/resolution/quantity controls, and `开始生成`; start button was disabled before upload. |
| Generation controls interaction | FAIL / inconclusive | Script clicked style chip and segmented controls and filled textarea, but the snapshot did not reflect the expected prompt/style text update, so this interaction was not confirmed before wrap-up. |
| Upload control keyboard/focus reachability before upload | PASS | Tab order reached both file inputs, textarea, style chips, and segmented controls. File inputs were focusable (`type=file`, `tabIndex=0`). |
| Upload control accepts file | PASS | DevTools file upload using `apps/web/public/icon-192.png` updated the card to `1/3 张已上传` and enabled `开始生成`. |
| Add-more upload keyboard/focus reachability after upload | PASS | Tab order after upload reached preview, remove button, add-more file input, second file input, textarea, chips, and controls. |
| Generation submit | PARTIAL | `POST /api/generation-tasks` returned mocked HTTP 201 and the app navigated to `/generate/loading/task_created_1`; because mocked task status remained processing, the runner timed out waiting for `/queue` after selecting quantity 2. |
| Direct result route for completed/incomplete/fake task | NOT COMPLETED | Planned checks were not reached before wrap-up due to the generation-route timeout. |

## Console / Runtime Errors

- No `Runtime.exceptionThrown` page errors captured.
- No `Network.loadingFailed` failures captured.
- No console errors captured.
- Console messages observed were Vite connection/debug messages and the React DevTools informational message only.

## API / Network Notes

Real browser/API calls observed:

- `GET http://localhost:5173/api/auth/me` -> 200
- `POST http://localhost:5173/api/auth/mock-login` -> 400 (`当前环境未启用模拟登录`)

DevTools-mocked API calls observed:

- `GET /api/auth/me` -> 200
- `GET /api/queue` -> 200
- `GET /api/history` -> 200
- `GET /api/gallery-items` -> 200
- `POST /api/uploads` -> 201
- `POST /api/generation-tasks` -> 201
- repeated `GET /api/generation-tasks/task_created_1` -> 200 while loading page polled processing task

## Caveats / Not Found

- The main limitation is auth mode: the running API had mock auth disabled and redirected login to external OIDC. Without OIDC credentials, real authenticated golden-path testing was blocked.
- Authenticated route checks used Chrome DevTools request interception to mock API responses and should be treated as UI smoke coverage rather than end-to-end API coverage.
- Disabled install state was not observed in the mocked authenticated pass; available install state was observed.
- Direct result route behavior for incomplete/fake tasks was not verified before wrap-up.
