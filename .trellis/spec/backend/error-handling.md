# Error Handling

> How errors are handled in this project.

---

## Scenario: REST API error envelope

### 1. Scope / Trigger

- Trigger: any backend route under `/api/**` that rejects input, requires auth, cannot find a resource, or cannot complete a state transition.
- All client-visible API failures should use one JSON envelope.

### 2. Signatures

```ts
function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}
```

### 3. Contracts

Error response body:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "personalReferenceAssetId is required"
  }
}
```

Standard MVP error codes:

- `UNAUTHORIZED`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `INVALID_STATE`
- `UPLOAD_FAILED`
- `GENERATION_FAILED`
- `INTERNAL_ERROR`

### 4. Validation & Error Matrix

| Condition | HTTP | Code |
|---|---:|---|
| No authenticated session | 401 | `UNAUTHORIZED` |
| Missing required request field | 400 | `VALIDATION_ERROR` |
| Uploaded file bytes are not PNG, JPG, or WEBP | 400 | `VALIDATION_ERROR` |
| Resource does not exist or is not owned by current user | 404 | `NOT_FOUND` |
| Result requested before generation completes | 409 | `INVALID_STATE` |
| Unexpected route exception | 500 | `INTERNAL_ERROR` |

### 5. Good/Base/Bad Cases

- Good: validate upload `category`, `file`, and detected PNG/JPG/WEBP bytes before writing to disk.
- Base: route returns `404 NOT_FOUND` for user-owned resources that are absent.
- Bad: do not return raw thrown errors or inconsistent shapes such as `{ message }` to the frontend.

### 6. Tests Required

- API tests/smoke checks should assert both HTTP status and `error.code` for unauthorized, validation, not found, and invalid-state paths.
- Frontend should read `error.message` defensively and display a user-facing fallback if absent.

### 7. Wrong vs Correct

#### Wrong

```ts
res.status(400).json({ message: 'file is required' });
```

#### Correct

```ts
sendError(res, 400, 'VALIDATION_ERROR', 'file is required');
```

## Scenario: OIDC login and OpenAI-compatible generation

### 1. Scope / Trigger

- Trigger: changing `AUTH_MODE=oidc`, OIDC callback handling, `GENERATION_MODE=openai`, or provider image-generation code.
- Real providers are allowed only when configured through `process.env`; never read or print local `.env` secrets in tooling output.

### 2. Signatures

Auth routes:

```text
GET  /api/auth/login
GET  /api/auth/callback?code=...&state=...
POST /api/auth/logout
GET  /api/auth/logout/provider
GET  /api/auth/me
```

Required OIDC env keys when `AUTH_MODE=oidc`:

```text
OIDC_DISCOVERY_URL
OIDC_CLIENT_ID
OIDC_REDIRECT_URI
OIDC_CLIENT_SECRET                 # optional for public-client providers, required if provider expects it
OIDC_POST_LOGOUT_REDIRECT_URI       # optional
```

Required OpenAI-compatible env keys when `GENERATION_MODE=openai`:

```text
OPENAI_BASE_URL
OPENAI_API_KEY
OPENAI_IMAGE_MODEL                  # defaults to gpt-image-2
OPENAI_PROMPT_MODEL                 # defaults to gpt-5.5; used for prompt planning and task-title generation
OPENAI_IMAGE_QUALITY                # defaults to high
OPENAI_REQUEST_TIMEOUT_MS           # optional, defaults to 600000ms; invalid or non-positive values fall back safely
```

### 3. Contracts

- `AUTH_MODE` valid values: `mock`, `oidc`; default is `mock`.
- `POST /api/auth/mock-login` is valid only when `AUTH_MODE=mock`; in OIDC mode it must return a `400 VALIDATION_ERROR` and must not create a session.
- Upload routes accept only files whose bytes are detected as PNG, JPG, or WEBP; do not trust client-supplied MIME type or original filename extension for storage metadata.
- `GENERATION_MODE` valid values: `mock`, `openai`; default is `mock`.
- OIDC login uses Authorization Code + PKCE.
- Store `state`, `nonce`, and `code_verifier` in the server session before redirecting.
- Verify `id_token` signature with provider JWKS before trusting claims.
- Supported ID token signing algorithms: `RS256`, `ES256`, `ES384`.
- Validate issuer, audience, authorized party (`azp`) for multi-audience tokens, expiration, issued-at, nonce, and non-empty `sub`.
- Darkroom task creation accepts text-only, source-only-with-text, reference-only-with-text, source+reference, and text+image requests. If `prompt` is empty, at least one source image and at least one reference image are required.
- `POST /api/style-reference-analysis` may exist as a legacy endpoint, but the Darkroom generation form must not call it; generation-time prompt planning owns image understanding.
- When uploaded images are present, prompt planning uses `/v1/chat/completions` with `OPENAI_PROMPT_MODEL`, sends role-labeled source/reference images, and returns an internal image-generation prompt that is not exposed in API payloads.
- Task title generation uses `/v1/chat/completions` with `OPENAI_PROMPT_MODEL` and includes user requirements plus source/reference counts; summaries should describe style/scene/subject/request characteristics and strip generic filler such as `暗室`, `暗房`, `大宇暗房`, or `Dayu Darkroom` unless user-provided.
- Do not persist access tokens. Keep `id_token` server-side only for optional provider logout.
- OpenAI-compatible text-only generation calls `/v1/images/generations` with JSON fields and no image files.
- OpenAI-compatible image generation calls `/v1/images/edits` with multipart image inputs; provider-bound input files are re-encoded as WebP using `cwebp -q 91`, reference images are appended before source images, the original uploaded files/assets remain unchanged, and responses may include either `b64_json` or `url` before local generated storage exposes `/static/generated/...`.
- `POST /api/generation-tasks` accepts either legacy single-id fields or normalized array fields, but API responses must always expose summary plus array-based reference data.
- `GET /api/queue` items include `summary` for every task; frontend should not infer a card title from raw prompt text.
- `GET /api/history` items include `prompt`, `styleTags`, `personalReferenceAssets`, `styleReferenceAssets`, and `generationParams` so the frontend can navigate home with a prefilled draft instead of creating an immediate retry task.
- `GET /api/gallery-items` items include original image width/height so the masonry grid and fullscreen preview can preserve aspect ratio.
- `POST /api/users/me/avatar` updates `users.avatar_asset_id` from a user-owned gallery item and returns the refreshed `user` payload.
- Frontend PWA wiring uses `manifest.webmanifest`, a Workbox-generated service worker from `vite-plugin-pwa`, and browser `beforeinstallprompt`; the install action is a UI affordance only and must not block normal app usage.
- `GET /api/generation-tasks/:taskId/events` is an authenticated SSE endpoint that emits `task` events with `{ task }` using the same task shape as `GET /api/generation-tasks/:taskId`.
- `GET /api/queue/events` is an authenticated SSE endpoint that emits `queue` events with `{ items }` using the same item shape as `GET /api/queue`.


### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| OIDC config missing | Redirect to frontend login with a safe auth error |
| Callback state mismatch | Reject callback and redirect with safe auth error |
| ID token signature invalid | Reject callback and redirect with safe auth error |
| ID token issuer/audience/azp/exp/iat/nonce/sub invalid | Reject callback and redirect with safe auth error |
| Style analysis `assetIds` empty | Return `400 VALIDATION_ERROR` for the legacy endpoint |
| Style analysis asset id is not owned by current user or is not `style_reference` | Return `400 VALIDATION_ERROR` for the legacy endpoint |
| Style analysis model response malformed or unavailable | Return concise fallback analysis for the legacy endpoint; do not block upload flow |
| Generation task has empty `prompt` and lacks source or reference images | Return `400 VALIDATION_ERROR` |
| Any source/personal asset id is not owned by the current user or is wrong category | Return `400 VALIDATION_ERROR` |
| Any reference/style asset id is not owned by the current user or is wrong category | Return `400 VALIDATION_ERROR` |
| Provider-bound WebP compression with `cwebp` fails | Mark task `failed` with `GENERATION_FAILED` and safe message |
| Gallery item requested for avatar update is missing or not owned | Return `404 NOT_FOUND` |
| `beforeinstallprompt` not available in browser | Keep app usable and show install affordance as non-blocking UI |
| SSE task stream opened for missing/not-owned task | Return JSON `404 NOT_FOUND` before stream headers are sent |
| SSE stream emits terminal task status | Emit the terminal snapshot, then close the stream |
| SSE stream has an unexpected sync failure after headers are sent | Emit an SSE `error` event and close the stream without trying to send JSON error payload |
| Workbox handles `/static/uploads/**` or `/static/generated/**` | Do not cache these URLs and do not serve app-shell HTML as their offline fallback |
| Mock-login endpoint called while `AUTH_MODE=oidc` | Return `400 VALIDATION_ERROR`; do not create a mock session |
| Upload bytes are not PNG, JPG, or WEBP | Return `400 VALIDATION_ERROR`; do not write file to disk |
| Uploaded file passes byte detection | Store generated filename and detected MIME/extension, not client-provided MIME/extension |


### 5. Good/Base/Bad Cases

- Good: provider callback verifies JWKS signature and claims before `users` / `auth_accounts` upsert.
- Good: quantity `4` creates four generation tasks and starts four runs; each task still owns exactly one `generation_results` row.
- Good: text-only Darkroom requests skip prompt planning and send the custom text directly to the image generation endpoint.
- Good: image-backed Darkroom requests run one prompt-planning chat call with role-labeled source/reference images, then use the planned prompt internally for image generation.
- Good: provider-bound image inputs are WebP-compressed at quality 91 and ordered reference-first so provider canvas/aspect inference follows the main reference image.
- Good: task summaries describe concrete style/scene/subject/request characteristics and avoid product filler such as `暗室`/`暗房` unless the user explicitly typed it.
- Good: queue/history responses return explicit sanitized summary and array-based reference assets so the frontend can render cards and prefill drafts without extra round trips.
- Good: avatar updates only accept gallery items already owned by the current user.
- Base: mock mode remains available and is used for local smoke tests.
- Bad: do not decode `id_token` payload and trust it without signature and claim validation.
- Bad: do not show planned image-generation prompts in task/result/record payloads for the MVP.
- Bad: do not send source images before reference images when reference images exist; some providers infer canvas/aspect from the first edit image.
- Bad: do not send original PNG/JPG/WebP upload bytes directly to the provider edit endpoint when WebP compression is available; use WebP quality 91 provider payloads instead.
- Bad: do not log `OPENAI_API_KEY`, `id_token`, provider responses, or downloaded image URLs with secrets.
- Bad: do not send user-controlled upload filenames to the provider prompt or multipart filename fields.
- Bad: do not make history “再次生成” call `/api/generation-tasks/:taskId/retry` when the intended UX is to return to home with editable prefilled inputs.

### 6. Tests Required

- Always run `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- Run mock-mode smoke after auth/generation changes: health, mock login, `/api/auth/me`, queue/history, logout, and at least one task completion when practical.
- Add assertions for `POST /api/style-reference-analysis`: empty ids, wrong ownership/category, fallback analysis when prompt model is unavailable, and concise successful `{ tags, description }` shape while it remains available as a legacy endpoint.
- Add assertions for `POST /api/generation-tasks`: text-only succeeds with no assets, empty text without both source/reference assets returns `400 VALIDATION_ERROR`, and invalid asset ownership/category returns `400 VALIDATION_ERROR`.
- Add assertions that image-backed OpenAI generation runs prompt planning, keeps planned prompts internal, sends reference images before source images, and compresses provider-bound inputs as WebP quality 91.
- Add assertions that task summaries strip generic product filler (`暗室`, `暗房`, `大宇暗房`, `Dayu Darkroom`) unless user-provided.
- Real OIDC/OpenAI end-to-end verification requires external credentials and should be done manually in the deployment environment without printing secrets.

### 7. Wrong vs Correct

#### Wrong

```ts
const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
upsertOidcUser(claims.sub);
```

#### Correct

```ts
const claims = await verifyOidcIdToken(idToken, discovery, expectedNonce);
upsertOidcUser(claims.sub);
```

#### Wrong

```ts
body: JSON.stringify({ prompt: task.prompt, image: task.personal_reference_asset_id })
```

#### Correct

```ts
const formData = new FormData();
formData.append('image', new Blob([referenceWebp], { type: 'image/webp' }), 'reference-image-1.webp');
formData.append('image', new Blob([sourceWebp], { type: 'image/webp' }), 'source-image-1.webp');
formData.append('prompt', plannedPrompt);
```

#### Wrong

```ts
const enhancedPrompt = await generateEnhancedOpenAiPrompt(task);
formData.append('prompt', enhancedPrompt);
```

#### Correct

```ts
const plannedPrompt = await buildImageGenerationPrompt(task);
const requestVariants = buildOpenAiImageRequestVariants(task, plannedPrompt);
```


#### Correct

```ts
navigate('/', {
  state: {
    prompt: historyItem.prompt,
    styleTags: historyItem.styleTags,
    personalReferenceAssets: historyItem.personalReferenceAssets,
    styleReferenceAssets: historyItem.styleReferenceAssets,
    generationParams: historyItem.generationParams,
  },
});
```

---



The MVP does not define custom error classes. Prefer direct validation in route handlers and the shared `sendError` helper until repeated service-level error handling justifies typed errors.

---

## Error Handling Patterns

- Validate auth first with `requireAuth` for protected routes.
- Validate request fields before file/database writes.
- Use ownership-aware lookups for user data.
- Let the terminal Express error middleware convert unexpected exceptions to `INTERNAL_ERROR`.

---

## API Error Responses

All `/api/**` errors use `{ "error": { "code", "message" } }`.

---

## Common Mistakes

- Do not leak filesystem paths or stack traces in API errors.
- Do not allow a retry/action button to trigger both its own action and parent-card navigation; separate actions explicitly in the UI.
