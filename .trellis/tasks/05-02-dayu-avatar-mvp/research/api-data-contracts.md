# Research: api-data-contracts

- **Query**: Research the minimal API/data contracts needed for a mock-first MVP for a mobile-first AI avatar web app, covering auth current user/logout/mock login, image upload categories, generation task creation/progress/result, gallery save/favorite/delete/download, queue/history listing, and local static file access; map conventions to SQLite tables and REST endpoints.
- **Scope**: mixed
- **Date**: 2026-05-02

## Findings

### Files Found

| File Path | Description |
|---|---|
| `need.md` | Primary product and technical requirements for the MVP, including mobile-first scope, SQLite, local file storage, mock-first generation flow, OAuth entry, and OpenAI image generation direction (`need.md:45-56`, `need.md:60-77`, `need.md:99-183`, `need.md:241-314`). |
| `.trellis/tasks/05-02-dayu-avatar-mvp/task.json` | Active planning task metadata for this MVP research target (`.trellis/tasks/05-02-dayu-avatar-mvp/task.json:1-24`). |
| `.trellis/spec/backend/database-guidelines.md` | Backend database guideline placeholder; no project-specific schema conventions are documented yet (`.trellis/spec/backend/database-guidelines.md:1-50`). |
| `.trellis/spec/backend/error-handling.md` | Backend error handling guideline placeholder; no existing API error envelope is documented yet (`.trellis/spec/backend/error-handling.md:1-50`). |
| `.trellis/spec/guides/cross-layer-thinking-guide.md` | Cross-layer guidance emphasizing explicit boundary contracts and format definitions (`.trellis/spec/guides/cross-layer-thinking-guide.md:17-47`). |

### Code Patterns

No application source files were found in the repository root during this research pass. Current contract decisions must therefore be anchored to requirements and placeholder specs rather than existing backend/frontend code.

Load-bearing requirement excerpts from `need.md`:

> `数据库：SQLite` (`need.md:51-54`)

> `图片存储：本地文件目录` (`need.md:53-55`)

> `ai使用OpenAI 规范接口，通过.env配置baseurl和apikey，图片生成使用\`/v1/images/generations\`，模型为\`gpt-image-2\`，默认质量参数为high。` (`need.md:56`)

> `开发初期可以先使用 mock 方式跑通完整流程：上传参考图 → 创建生成任务 → 展示 Loading → 返回模拟生成结果 → 保存到图库 → 查看任务和历史记录` (`need.md:268-279`)

### Proposed REST Endpoints

The minimal contract below matches the MVP pages and the mock-first flow described in `need.md`.

#### 1. Auth

| Method | Endpoint | Purpose | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/auth/me` | Return current signed-in user or null session state. | Cookie/session-based, no body. | `200 { "user": UserSummary | null }` |
| `POST` | `/api/auth/mock-login` | Create a local mock session for MVP/demo mode. | `{ "displayName": string, "avatarUrl"?: string }` | `200 { "user": UserSummary, "session": SessionSummary }` |
| `POST` | `/api/auth/logout` | Clear local session and optionally expose IdP logout redirect URL. | Empty body. | `200 { "success": true, "postLogoutRedirectUrl"?: string }` |

Suggested JSON shapes:

```json
{
  "user": {
    "id": "usr_123",
    "displayName": "Dayu Demo User",
    "email": "demo@example.com",
    "avatarUrl": "/static/generated/avatars/demo-user.png"
  }
}
```

```json
{
  "session": {
    "id": "sess_123",
    "expiresAt": "2026-05-09T10:00:00.000Z",
    "authMode": "mock"
  }
}
```

Notes:
- `need.md:66-77` requires an OAuth entrypoint eventually, but `need.md:295-296` explicitly allows mock login first.
- Minimal MVP contract can expose only local session data now while reserving provider fields in the database for later OIDC integration.

#### 2. Uploads

Two upload categories are required by `need.md:112-120`.

| Method | Endpoint | Purpose | Request | Response |
|---|---|---|---|---|
| `POST` | `/api/uploads` | Upload one image asset with category metadata. | `multipart/form-data` with `file`, `category` | `201 { "asset": FileAsset }` |
| `GET` | `/api/uploads/:assetId` | Read uploaded asset metadata. | Path param only. | `200 { "asset": FileAsset }` |

Category enum:
- `personal_reference`
- `style_reference`

Suggested response shape:

```json
{
  "asset": {
    "id": "asset_123",
    "category": "personal_reference",
    "mimeType": "image/jpeg",
    "width": 1024,
    "height": 1536,
    "fileName": "portrait.jpg",
    "fileUrl": "/static/uploads/2026/05/portrait.jpg",
    "createdAt": "2026-05-02T10:00:00.000Z"
  }
}
```

#### 3. Generation tasks

| Method | Endpoint | Purpose | Request | Response |
|---|---|---|---|---|
| `POST` | `/api/generation-tasks` | Create a new mock/real generation task. | `CreateGenerationTaskRequest` | `201 { "task": GenerationTask }` |
| `GET` | `/api/generation-tasks/:taskId` | Read a single task with current progress and result summary if available. | Path param only. | `200 { "task": GenerationTaskDetail }` |
| `GET` | `/api/generation-tasks/:taskId/progress` | Poll loading/progress state. | Path param only. | `200 { "taskId": string, "status": TaskStatus, "progress": TaskProgress }` |
| `GET` | `/api/generation-tasks/:taskId/result` | Read result payload after completion. | Path param only. | `200 { "result": GenerationResult }` |
| `POST` | `/api/generation-tasks/:taskId/retry` | Create a new task by copying prompt/inputs from a failed or completed task. | Empty body or optional overrides. | `201 { "task": GenerationTask }` |

Suggested create request:

```json
{
  "prompt": "清透苹果系艺术头像，自然光，画廊感",
  "styleTags": ["清透写真", "艺术肖像", "自然光"],
  "personalReferenceAssetId": "asset_person_123",
  "styleReferenceAssetId": "asset_style_456",
  "generationParams": {
    "model": "gpt-image-2",
    "quality": "high",
    "size": "1024x1536",
    "outputFormat": "png"
  }
}
```

Minimal status enum matching `need.md:173-180`:
- `queued`
- `processing`
- `completed`
- `failed`
- `canceled`

Suggested task detail shape:

```json
{
  "task": {
    "id": "task_123",
    "status": "processing",
    "prompt": "清透苹果系艺术头像，自然光，画廊感",
    "styleTags": ["清透写真", "艺术肖像", "自然光"],
    "generationParams": {
      "model": "gpt-image-2",
      "quality": "high",
      "size": "1024x1536",
      "outputFormat": "png"
    },
    "progress": {
      "percent": 60,
      "step": "生成头像构图",
      "message": "Mock generation in progress"
    },
    "result": null,
    "createdAt": "2026-05-02T10:00:00.000Z",
    "updatedAt": "2026-05-02T10:00:12.000Z"
  }
}
```

Suggested result shape:

```json
{
  "result": {
    "id": "res_123",
    "taskId": "task_123",
    "imageUrl": "/static/generated/2026/05/task_123/result.png",
    "thumbnailUrl": "/static/generated/2026/05/task_123/result-thumb.png",
    "width": 1024,
    "height": 1536,
    "savedToGallery": false,
    "createdAt": "2026-05-02T10:00:30.000Z"
  }
}
```

#### 4. Gallery

`need.md:203-238` separates gallery from history: gallery contains user-saved final works only.

| Method | Endpoint | Purpose | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/gallery-items` | List saved gallery items. | Optional query: `favorited=true` | `200 { "items": GalleryItem[] }` |
| `POST` | `/api/gallery-items` | Save a completed generation result to gallery. | `{ "generationResultId": string }` | `201 { "item": GalleryItem }` |
| `PATCH` | `/api/gallery-items/:itemId` | Toggle favorite or update lightweight metadata. | `{ "isFavorited": boolean }` | `200 { "item": GalleryItem }` |
| `DELETE` | `/api/gallery-items/:itemId` | Remove gallery record; generated file may remain for history. | Path param only. | `200 { "success": true }` |
| `GET` | `/api/gallery-items/:itemId/download` | Download the saved image file. | Path param only. | Binary file response |

Suggested item shape:

```json
{
  "item": {
    "id": "gal_123",
    "generationResultId": "res_123",
    "imageUrl": "/static/generated/2026/05/task_123/result.png",
    "thumbnailUrl": "/static/generated/2026/05/task_123/result-thumb.png",
    "isFavorited": true,
    "savedAt": "2026-05-02T10:01:00.000Z"
  }
}
```

#### 5. Queue and history

Both pages can read from the same `generation_tasks` source with different filters.

| Method | Endpoint | Purpose | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/queue` | List active/recent tasks for queue page. | Query: `status?`, `limit?`, `cursor?` | `200 { "items": QueueItem[] }` |
| `GET` | `/api/history` | List full generation history. | Query: `status?`, `limit?`, `cursor?` | `200 { "items": HistoryItem[] }` |

Minimal queue item:

```json
{
  "id": "task_123",
  "status": "queued",
  "progress": { "percent": 0, "step": "排队中" },
  "createdAt": "2026-05-02T10:00:00.000Z"
}
```

Minimal history item:

```json
{
  "id": "task_123",
  "status": "completed",
  "promptSummary": "清透苹果系艺术头像",
  "referenceTypes": ["personal_reference", "style_reference"],
  "generationParams": {
    "model": "gpt-image-2",
    "quality": "high",
    "size": "1024x1536"
  },
  "resultImageUrl": "/static/generated/2026/05/task_123/result.png",
  "createdAt": "2026-05-02T10:00:00.000Z"
}
```

#### 6. Local static file access

| Method | Endpoint | Purpose | Request | Response |
|---|---|---|---|---|
| `GET` | `/static/uploads/*` | Serve uploaded reference images. | Path only. | Binary file response |
| `GET` | `/static/generated/*` | Serve generated result and thumbnail images. | Path only. | Binary file response |

Public API payloads should expose URL paths such as `/static/uploads/...` and `/static/generated/...`; database rows can keep the internal relative storage path.

### Shared JSON Conventions

Because `.trellis/spec/backend/error-handling.md` is empty, there is no existing error envelope to reuse. A minimal consistent response convention for this MVP can be documented as:

Successful list/read:

```json
{ "items": [] }
```

Successful single resource:

```json
{ "task": {} }
```

Minimal error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "personalReferenceAssetId is required"
  }
}
```

Minimal error code set for the MVP:
- `UNAUTHORIZED`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `INVALID_STATE`
- `UPLOAD_FAILED`
- `GENERATION_FAILED`

### SQLite Table Mapping

The tables below are the smallest set that covers the requested flows while preserving the separation between uploads, tasks, results, gallery, and sessions.

#### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Application user ID, e.g. `usr_*` |
| `display_name` | `TEXT NOT NULL` | Used by account/settings UI |
| `email` | `TEXT` | Optional for mock login, useful for future OAuth |
| `avatar_asset_id` | `TEXT` | Optional FK to `file_assets.id` |
| `created_at` | `TEXT NOT NULL` | ISO timestamp |
| `updated_at` | `TEXT NOT NULL` | ISO timestamp |

#### `auth_accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Account row ID |
| `user_id` | `TEXT NOT NULL` | FK to `users.id` |
| `provider` | `TEXT NOT NULL` | `mock` or future `dayu_oidc` |
| `provider_subject` | `TEXT NOT NULL` | Mock subject or OIDC `sub` |
| `last_login_at` | `TEXT` | Latest successful login |
| `created_at` | `TEXT NOT NULL` | ISO timestamp |
| `updated_at` | `TEXT NOT NULL` | ISO timestamp |

Recommended unique index: `(provider, provider_subject)`.

#### `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Session ID |
| `user_id` | `TEXT NOT NULL` | FK to `users.id` |
| `auth_mode` | `TEXT NOT NULL` | `mock` or `oidc` |
| `id_token` | `TEXT` | Optional; useful for future RP-initiated logout |
| `expires_at` | `TEXT` | Session expiry |
| `created_at` | `TEXT NOT NULL` | ISO timestamp |
| `deleted_at` | `TEXT` | Soft logout marker |

#### `file_assets`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Asset ID |
| `user_id` | `TEXT NOT NULL` | Owner |
| `category` | `TEXT NOT NULL` | `personal_reference`, `style_reference`, `generated_result`, `generated_thumbnail` |
| `storage_disk` | `TEXT NOT NULL` | For MVP, constant like `local` |
| `storage_path` | `TEXT NOT NULL` | Relative file path under uploads/generated directory |
| `public_url` | `TEXT NOT NULL` | `/static/...` URL |
| `file_name` | `TEXT NOT NULL` | Original or generated file name |
| `mime_type` | `TEXT NOT NULL` | e.g. `image/png` |
| `width` | `INTEGER` | Optional image metadata |
| `height` | `INTEGER` | Optional image metadata |
| `byte_size` | `INTEGER` | Optional file size |
| `created_at` | `TEXT NOT NULL` | ISO timestamp |

#### `generation_tasks`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Task ID |
| `user_id` | `TEXT NOT NULL` | Owner |
| `status` | `TEXT NOT NULL` | `queued`, `processing`, `completed`, `failed`, `canceled` |
| `prompt` | `TEXT NOT NULL` | Full prompt text |
| `style_tags_json` | `TEXT NOT NULL` | JSON array string |
| `personal_reference_asset_id` | `TEXT NOT NULL` | FK to `file_assets.id` |
| `style_reference_asset_id` | `TEXT` | FK to `file_assets.id` |
| `model` | `TEXT NOT NULL` | `gpt-image-2` in real mode; same value can be stored in mock mode |
| `quality` | `TEXT NOT NULL` | Default `high` per `need.md:56` |
| `size` | `TEXT NOT NULL` | Example `1024x1536` |
| `output_format` | `TEXT NOT NULL` | `png`, `jpeg`, or `webp` |
| `progress_percent` | `INTEGER NOT NULL DEFAULT 0` | 0-100 |
| `progress_step` | `TEXT` | Example `分析个人形象` |
| `error_code` | `TEXT` | Failure classification |
| `error_message` | `TEXT` | Human-readable failure detail |
| `source_task_id` | `TEXT` | Retry/regenerate source |
| `created_at` | `TEXT NOT NULL` | ISO timestamp |
| `updated_at` | `TEXT NOT NULL` | ISO timestamp |
| `completed_at` | `TEXT` | Completion time |

#### `generation_results`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Result ID |
| `task_id` | `TEXT NOT NULL UNIQUE` | One final result per task for minimal MVP |
| `image_asset_id` | `TEXT NOT NULL` | FK to generated image asset |
| `thumbnail_asset_id` | `TEXT` | FK to thumbnail asset |
| `provider_request_id` | `TEXT` | Optional external trace ID |
| `revised_prompt` | `TEXT` | Optional carry-over from provider response |
| `saved_to_gallery` | `INTEGER NOT NULL DEFAULT 0` | 0/1 convenience flag |
| `created_at` | `TEXT NOT NULL` | ISO timestamp |

#### `gallery_items`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Gallery row ID |
| `user_id` | `TEXT NOT NULL` | Owner |
| `generation_result_id` | `TEXT NOT NULL UNIQUE` | Saved final work |
| `is_favorited` | `INTEGER NOT NULL DEFAULT 0` | 0/1 |
| `saved_at` | `TEXT NOT NULL` | Save timestamp |
| `deleted_at` | `TEXT` | Optional soft delete |

### Data Flow Mapping

Minimal cross-layer flow, aligned with `.trellis/spec/guides/cross-layer-thinking-guide.md:19-47`:

1. `POST /api/uploads` stores reference image metadata in `file_assets` and writes the file under `/static/uploads/...`.
2. `POST /api/generation-tasks` validates asset ownership + request payload, inserts `generation_tasks`, and returns an initial `queued` or `processing` task.
3. Mock worker/service updates `generation_tasks.progress_*` and `status` from `queued` to `processing` to `completed`.
4. Completion stores generated files in `file_assets`, inserts `generation_results`, and exposes `/static/generated/...` URLs.
5. `POST /api/gallery-items` links a completed `generation_result` into `gallery_items` without removing it from history.
6. `GET /api/queue` and `GET /api/history` both read `generation_tasks`; queue focuses on active/recent tasks, history includes all tasks and parameter summaries.

### External References

- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — defines discovery metadata such as `userinfo_endpoint`; relevant for future non-mock `GET /api/auth/me` enrichment and provider endpoint resolution.
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — defines `end_session_endpoint`, `id_token_hint`, and `post_logout_redirect_uri`; relevant for future logout behavior behind `POST /api/auth/logout`.
- [OpenAI Images API Reference: generate](https://developers.openai.com/api/reference/resources/images/methods/generate/) — confirms image generation endpoint shape, `quality` options, output formats, and response structure.
- [OpenAI Image generation guide](https://platform.openai.com/docs/guides/image-generation) — confirms `gpt-image-2` returns base64 image data, supports `quality`, `size`, and `output_format`, and is compatible with `/v1/images/generations`.
- [OpenAI GPT Image 2 model docs](https://developers.openai.com/api/docs/models/gpt-image-2) — confirms `gpt-image-2` is valid for `v1/images/generations` and supports high-quality output for production-oriented image generation.

### Related Specs

- `.trellis/spec/backend/database-guidelines.md` — currently empty, so no existing schema naming or migration rules constrain the proposed tables.
- `.trellis/spec/backend/error-handling.md` — currently empty, so no existing response/error envelope constrains the proposed API shape.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — relevant because this MVP spans API, service, storage, database, and frontend task polling boundaries.

## Caveats / Not Found

- No backend or frontend implementation files were found, so there are no existing route handlers, model types, serializers, or database migrations to mirror.
- The configured OIDC discovery URL from `need.md:67` could not be fetched directly in this environment; the endpoint returned `hello stranger~` instead of a discovery document. Future non-mock auth wiring will need provider-specific verification in a real browser/server environment.
- Existing Trellis backend spec files are placeholders, so naming conventions and error response shapes here are proposed contract research, not confirmed project conventions.
