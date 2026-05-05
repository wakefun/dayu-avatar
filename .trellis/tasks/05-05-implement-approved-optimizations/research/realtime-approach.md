# Research: Realtime Approach

- **Query**: Research only local repo context for replacing polling with real-time updates in /home/wakefun/project/dayu-avatar for task .trellis/tasks/05-05-implement-approved-optimizations. Compare SSE vs WebSocket for React/Vite frontend + Express backend where task/queue updates are server-to-client only. Inspect relevant files: apps/api/src/index.ts, apps/web/src/pages/LoadingPage.tsx, apps/web/src/pages/QueuePage.tsx, apps/web/src/lib/api.ts. Include repo constraints, recommended MVP, affected files, validation.
- **Scope**: internal
- **Date**: 2026-05-05

## Findings

### Files Found

| File Path | Description |
|---|---|
| `apps/api/src/index.ts` | Express API, session auth, generation task routes, queue route, task synchronization/generation logic, and HTTP server startup. |
| `apps/web/src/pages/LoadingPage.tsx` | Task loading route with fixed interval polling of `api.getTask(taskId)`. |
| `apps/web/src/pages/QueuePage.tsx` | Queue route with fixed interval polling of `api.getQueue()`. |
| `apps/web/src/lib/api.ts` | Central frontend fetch wrapper and API client methods for tasks, progress, queue, retry, result, etc. |
| `apps/web/src/lib/types.ts` | Shared frontend API boundary types for `GenerationTask` and `QueueItem`. |
| `apps/web/vite.config.ts` | Vite dev proxy forwards `/api` and `/static` to the Express API target. |
| `package.json` | Workspace scripts and Node/pnpm engine constraints. |
| `apps/api/package.json` | API dependencies: Express 5, express-session, cors, multer; no WebSocket package currently present. |
| `apps/web/package.json` | Web dependencies: React 19, Vite 7, React Router 7; no WebSocket/EventSource helper package currently present. |
| `.trellis/tasks/05-05-implement-approved-optimizations/prd.md` | Task PRD approving real-time updates and noting SSE may be sufficient for server-to-client updates. |
| `.trellis/spec/backend/error-handling.md` | Backend contracts and validation expectations for task/queue payloads and required verification. |
| `.trellis/spec/backend/database-guidelines.md` | Database/task status contracts and smoke-test expectations. |
| `.trellis/spec/frontend/type-safety.md` | Frontend task/queue/result contract guidance and type organization. |
| `.trellis/spec/frontend/component-guidelines.md` | Frontend validation/smoke expectations for queue reachability and card interactions. |

### Code Patterns

- `apps/api/src/index.ts:303-324` configures CORS with `origin: webOrigin` and `credentials: true`, JSON parsing, and `express-session` with cookie name `dayu.sid`, `httpOnly`, `sameSite: 'lax'`, `secure: 'auto'`, and SQLite session storage. Realtime endpoints must preserve session-cookie authentication and user ownership checks.
- `apps/api/src/index.ts:533-605` creates one or more `generation_tasks`, starts each run with `void startGenerationRun(task.id)`, and returns the current `mapTask(...)` shape. A realtime MVP can keep this route shape unchanged and use stream endpoints only for subsequent updates.
- `apps/api/src/index.ts:612-626` serves `GET /api/generation-tasks/:taskId` by calling `syncAndGetOwnedTask(req.session.userId!, taskId)` and returning `{ task: mapTask(task, true) }`. This is the full task payload already consumed by `LoadingPage`.
- `apps/api/src/index.ts:628-650` serves `GET /api/generation-tasks/:taskId/progress` with a smaller progress payload but the current loading page does not use it.
- `apps/api/src/index.ts:716-740` serves `GET /api/queue` by calling `syncUserTasks(req.session.userId!)`, selecting user-owned tasks, and returning `{ items: [...] }` with `id`, `status`, `summary`, `progress`, `createdAt`, `resultUrl`, and `errorMessage`.
- `apps/api/src/index.ts:1423-1431` implements `syncUserTasks(userId)` by selecting active tasks with status `queued` or `processing` and calling `syncTask(task.id)` for each.
- `apps/api/src/index.ts:1433-1441` implements `syncAndGetOwnedTask(userId, taskId)` by checking ownership before syncing and returning the owned task after sync.
- `apps/api/src/index.ts:1443-1484` implements `syncTask(taskId)` as time/checkpoint-based progression for queued/processing tasks. Mock mode finalizes after elapsed checkpoints; OpenAI mode marks 96% and starts async generation.
- `apps/api/src/index.ts:1516-1521` makes mock generation progress only when `syncTask` is invoked; currently polling drives progression in mock mode.
- `apps/api/src/index.ts:1523-1533` tracks OpenAI generation with an in-memory `generationRuns` map.
- `apps/api/src/index.ts:1536-1562` completes or fails OpenAI tasks after provider work, updating the database directly.
- `apps/api/src/index.ts:2055-2092` maps task rows to the `GenerationTask` response shape. Realtime task events should reuse this shape rather than introduce duplicate frontend-only task objects.
- `apps/api/src/index.ts:934-936` starts Express with `app.listen(port, ...)`; no separate `http.Server` object or WebSocket upgrade handling exists today.
- `apps/web/src/pages/LoadingPage.tsx:15-48` uses `useEffect`, a `stopped` flag, and `window.setInterval(..., 1500)` to repeatedly call `api.getTask(taskId)`. It navigates to `/generate/result/:taskId` when status becomes `completed` and clears the interval for `failed`/`canceled`.
- `apps/web/src/pages/QueuePage.tsx:12-23` defines `load = async () => api.getQueue()` and polls every 2000ms via `window.setInterval`, clearing the interval on unmount.
- `apps/web/src/lib/api.ts:12-36` centralizes fetch with `credentials: 'include'`, JSON parsing, and shared error handling. `EventSource` cannot set arbitrary fetch options, but same-origin `/api/...` stream URLs should include the session cookie automatically; cross-origin direct API use would need `new EventSource(url, { withCredentials: true })`.
- `apps/web/src/lib/api.ts:78-86` exposes `getTask`, `getTaskProgress`, `getTaskResult`, `retryTask`, and `getQueue`; no realtime helper exists yet.
- `apps/web/vite.config.ts:16-19` proxies `/api` and `/static` to the API target in development. A same-origin `/api/events...` or `/api/realtime...` SSE endpoint should be covered by the existing `/api` proxy.

### SSE vs WebSocket Comparison for This Repo

| Criterion | SSE | WebSocket |
|---|---|---|
| Direction needed by task | Fits server-to-client task/queue updates. Client actions already use normal POST routes (`createTask`, `retryTask`). | Supports bidirectional messages, but no client-to-server realtime messages are required by the PRD or inspected code. |
| Browser client support | Native `EventSource`; no frontend dependency required. | Native `WebSocket`, but reconnect/event protocol usually needs app code or a helper. |
| Backend fit | Plain Express response stream over `GET`; can sit behind existing `/api` routing, `cors`, and `express-session`. | Requires HTTP upgrade handling and access to the underlying server; current `app.listen(...)` does not expose server setup for route-local WebSocket handling. |
| Auth fit | Same-origin `/api/...` stream can use existing cookie session; cross-origin EventSource supports `withCredentials`. Keep `requireAuth`/ownership checks. | Browser WebSocket authentication via cookies is possible, but Express middleware/session parsing is not automatically applied to upgrade requests without additional wiring. |
| Dependency impact | No new package needed for MVP. | Likely adds a WebSocket server dependency such as `ws` and corresponding upgrade/session integration. |
| Payload fit | Text events carrying JSON snapshots (`task`, `queue`) match existing REST response shapes. | Also can carry JSON, but introduces bidirectional protocol choices not needed for current updates. |
| Operational fit | Long-lived HTTP response; simpler with current Vite `/api` proxy and Express app. | Upgrade support may need proxy/server adjustments and more deployment assumptions. |

### Recommended MVP

Use Server-Sent Events for the first real-time implementation because the app needs server-to-client task/queue updates only, the frontend can use native `EventSource`, and the backend can add protected Express `GET` stream endpoints without changing the current HTTP server architecture or adding a WebSocket dependency.

Suggested MVP shape based on current repo contracts:

1. Add one authenticated task stream endpoint, for example `GET /api/generation-tasks/:taskId/events`, that:
   - Uses `requireAuth` and `syncAndGetOwnedTask(req.session.userId!, taskId)` just like `GET /api/generation-tasks/:taskId`.
   - Sends `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, and an initial task event.
   - Reuses `mapTask(task, true)` for event payloads so `LoadingPage` can keep the same `GenerationTask` state shape.
   - Emits only when relevant task data changes, or on a small internal tick while active, and ends/closes after terminal `completed`, `failed`, or `canceled` has been emitted.
2. Add one authenticated queue stream endpoint, for example `GET /api/queue/events`, that:
   - Uses `requireAuth` and `syncUserTasks(req.session.userId!)` like `GET /api/queue`.
   - Reuses the existing `/api/queue` item projection exactly so `QueuePage` can keep `QueueItem[]` state.
   - Emits an initial queue snapshot and subsequent snapshots while the connection is open.
3. In `apps/web/src/lib/api.ts`, add small native `EventSource` helpers or exported URL builders for the stream endpoints. Keep existing REST methods as fallback/initial compatibility where useful.
4. In `LoadingPage`, replace the fixed `window.setInterval` polling loop with an `EventSource` subscription to the task stream. Preserve current UI decisions: update `task`, clear `error` on successful event, navigate to result on `completed`, and show terminal failure/canceled copy for terminal failures.
5. In `QueuePage`, replace the fixed `window.setInterval` polling loop with an `EventSource` subscription to the queue stream. Preserve `onOpen` and `onRetry`; after retry navigation to loading remains unchanged.
6. Keep existing REST endpoints because they are still useful for direct page loads, result-route checks, retries, smoke tests, and fallback behavior.

Important repo-specific constraint: because mock-mode progression currently advances when `syncTask`/`syncUserTasks` is called (`apps/api/src/index.ts:1423-1484` and `apps/api/src/index.ts:1516-1521`), an SSE endpoint still needs an internal server-side cadence or explicit generation progress notifications. Simply opening an SSE connection without invoking sync periodically would remove the frontend polling but also stop mock-mode progress updates.

### Affected Files

- `apps/api/src/index.ts`
  - Add SSE stream route(s) near the existing task/queue GET routes.
  - Factor or locally duplicate the queue item projection carefully if needed; keep API fields identical to `/api/queue`.
  - Preserve `requireAuth`, ownership checks, `sendError` behavior before headers are committed, and terminal error middleware behavior for non-stream routes.
- `apps/web/src/lib/api.ts`
  - Add stream URLs/helpers while preserving `request<T>` and existing methods.
  - If using raw `EventSource`, document/encode stream payload types via imports from `./types` rather than page-local duplicate shapes.
- `apps/web/src/pages/LoadingPage.tsx`
  - Replace `window.setInterval(..., 1500)` with a stream subscription and cleanup via `eventSource.close()`.
  - Preserve navigation on completion and terminal failure/canceled behavior.
- `apps/web/src/pages/QueuePage.tsx`
  - Replace `window.setInterval(..., 2000)` with a stream subscription and cleanup via `eventSource.close()`.
  - Preserve existing queue card actions and navigation.
- `apps/web/src/lib/types.ts`
  - Only needed if adding shared stream event/payload types; current `GenerationTask` and `QueueItem` are already sufficient for basic snapshots.
- `.trellis/spec/**`
  - If implementation establishes realtime route contracts, the PRD DoD says specs should be updated. The research task itself must not edit specs.

### Repo Constraints

- Project uses Node `>=24.0.0` and pnpm `>=10.20.0` (`package.json:5-8`).
- API package is CommonJS TypeScript with Express 5.1.0, `express-session`, and `cors`; no WebSocket server dependency is present (`apps/api/package.json:4-17`).
- Web package is React 19/Vite 7/React Router 7 with no realtime helper dependency (`apps/web/package.json:11-23`).
- Vite dev server proxies `/api` to the API target (`apps/web/vite.config.ts:16-19`), so same-origin stream URLs under `/api` match current fetch URLs.
- Existing API calls use cookie credentials (`apps/web/src/lib/api.ts:20-25`); stream auth should keep session-cookie behavior.
- Task and queue payload contracts already exist and should be reused (`apps/web/src/lib/types.ts:26-84`; `apps/api/src/index.ts:2055-2092`; `apps/api/src/index.ts:723-735`).
- Current frontend acceptance criteria specifically call for loading and queue pages to receive task updates without fixed polling loops (`.trellis/tasks/05-05-implement-approved-optimizations/prd.md:37-41`).
- Backend specs require queue items to include `summary`, history/task payloads to keep array-based reference data, and all `/api/**` errors to use `{ error: { code, message } }` for normal JSON routes (`.trellis/spec/backend/error-handling.md:136-181`, `.trellis/spec/backend/error-handling.md:251-253`).
- Frontend specs require shared API boundary types and avoiding page-local duplicate response shapes (`.trellis/spec/frontend/type-safety.md:117-141`).

### Validation

Recommended validation commands and smoke paths from repo scripts/specs:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- Mock-mode backend smoke after auth/generation changes: health, mock login, `/api/auth/me`, create a task, observe realtime loading progress to terminal completion, confirm result route, confirm `/api/queue` still returns items with `summary`, and logout.
- Browser smoke for frontend: login/reachability, generate a task, verify `LoadingPage` updates without its fixed interval loop and navigates to result on completion, verify `QueuePage` updates without its fixed interval loop, verify retry still navigates to `/generate/loading/:taskId`.
- Regression checks: failed/canceled tasks still show terminal copy on loading page; completed queue cards still open result route; no duplicate action/navigation behavior on queue card retry/open.

### Related Specs

- `.trellis/tasks/05-05-implement-approved-optimizations/prd.md` — approved task scope and acceptance criteria for replacing polling with realtime updates.
- `.trellis/spec/backend/error-handling.md` — backend API contracts, task/queue payload expectations, and required validation commands/smoke.
- `.trellis/spec/backend/database-guidelines.md` — `generation_tasks.status` values and database/query rules.
- `.trellis/spec/frontend/type-safety.md` — centralized API types and task/queue/result contracts.
- `.trellis/spec/frontend/component-guidelines.md` — queue/card interaction and browser smoke expectations.

## Caveats / Not Found

- No existing SSE or WebSocket implementation was found in `apps/api/src` or `apps/web/src`.
- No WebSocket dependency is currently installed in API or web packages.
- `getTaskProgress` exists in `apps/web/src/lib/api.ts` but no current page uses it.
- This research used local repo context only; no external documentation was consulted.
- The active Trellis task command returned no active task, but the user supplied the explicit task path and output file path.
