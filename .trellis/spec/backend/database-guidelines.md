# Database Guidelines

> Database patterns and conventions for this project.

---

## Scenario: Local SQLite persistence for the MVP

### 1. Scope / Trigger

- Trigger: backend features that persist auth/session, upload, generation, gallery, queue, or history data.
- Use SQLite for local MVP persistence and local file metadata.
- Use Node 24 built-in `node:sqlite` (`DatabaseSync`) instead of native third-party SQLite packages unless the install policy explicitly allows package lifecycle/native build scripts.

### 2. Signatures

- Database file: `data/app.db`.
- Runtime import:

```ts
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
```

- Required tables for the MVP:
  - `users`
  - `auth_accounts`
  - `sessions`
  - `file_assets`
  - `generation_tasks`
  - `generation_results`
  - `gallery_items`

### 3. Contracts

- `file_assets.storage_path` stores a relative local path under `uploads/...` or `generated/...`.
- `file_assets.public_url` must be a static URL under `/static/uploads/...` or `/static/generated/...`; these routes set private caching, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff` while the public URL contract remains unchanged.
- `generation_tasks.status` is one of `queued`, `processing`, `completed`, `failed`, `canceled`.
- `generation_tasks.summary` stores the user-facing short task summary shown in queue/history cards.
- `generation_tasks.personal_reference_asset_ids_json` stores a JSON string array of 1-3 personal reference asset ids.
- `generation_tasks.style_reference_asset_ids_json` stores a JSON string array of 0-3 style reference asset ids.
- `generation_tasks.personal_reference_asset_id` and `generation_tasks.style_reference_asset_id` remain as first-asset compatibility fields for older rows and provider fallbacks.
- `generation_tasks.style_tags_json` stores a JSON string array.
- `generation_results.thumbnail_asset_id` stores an optional `generated_thumbnail` file asset for the generated result preview.
- Generated thumbnails are WebP files produced by the runtime `cwebp` binary at quality 88; configure `CWEBP_BIN` when the binary is not on `PATH`.
- Session rows store `session_data` JSON plus optional `user_id`, `auth_mode`, `expires_at`, and soft-delete `deleted_at`.

### 4. Validation & Error Matrix

- Missing owner session -> API layer returns `UNAUTHORIZED` before querying user-owned data.
- Asset ID not owned by current user -> route returns `NOT_FOUND` or `VALIDATION_ERROR` depending on endpoint semantics.
- `personal_reference_asset_id` not found or wrong category -> `VALIDATION_ERROR`.
- `style_reference_asset_id` provided but wrong category -> `VALIDATION_ERROR`.
- `personalReferenceAssetIds` must normalize to 1-3 owned `personal_reference` assets before insert.
- `styleReferenceAssetIds` must normalize to 0-3 owned `style_reference` assets before insert.
- Legacy rows missing `*_asset_ids_json` must still round-trip through API using first-asset fallback fields.
- Result requested before task is completed -> `INVALID_STATE`.

### 5. Good/Base/Bad Cases

- Good: create upload asset row and write file under `data/uploads/<category>/<yyyy>/<mm>/...`, exposing `/static/uploads/...`.
- Good: persist every personal/style reference asset id in the JSON array columns while also copying the first asset into the legacy single-id columns.
- Base: old rows that only have `personal_reference_asset_id` / `style_reference_asset_id` still map back to frontend arrays via backend fallback logic.
- Base: mock generation inserts one `generation_tasks` row, creates a generated result plus WebP thumbnail, then marks the task `completed`.
- Bad: do not mark a task `completed` before result and thumbnail persistence succeeds.
- Bad: do not replace multi-reference storage with comma-joined text or drop the legacy single-id fields without a real migration.
- Bad: do not serve the whole `data/` directory statically; that can expose `data/app.db`.

### 6. Tests Required

- Typecheck must pass for all SQLite calls.
- Runtime smoke test should create a mock login, upload both reference categories, create a generation task, poll completion, save a result to gallery, and verify records/gallery lists include the data.
- Add a multi-reference smoke path that uploads at least 2 personal references and 1 style reference, then asserts the task/records payload still returns all assets in order.
- Add a legacy-row compatibility assertion that a task without `*_asset_ids_json` still returns one-element arrays from the API.
- Add a generated-result smoke assertion that `generation_results.thumbnail_asset_id` points to a `generated_thumbnail` WebP asset.
- Static file smoke test should confirm generated/uploaded image URLs resolve with private/no-referrer/nosniff headers while `data/app.db` is not publicly exposed.

### 7. Wrong vs Correct

#### Wrong

```ts
createGenerationTask({
  personalReferenceAssetId: personalAsset.id,
  styleReferenceAssetId: styleAsset.id,
});
```

#### Correct

```ts
createGenerationTask({
  personalReferenceAssetId: personalAssets[0]!.id,
  styleReferenceAssetId: styleAssets[0]?.id ?? null,
  personalReferenceAssetIds: personalAssets.map((asset) => asset.id),
  styleReferenceAssetIds: styleAssets.map((asset) => asset.id),
});
```

---

## Query Patterns

- Keep SQL close to the route/service that owns the behavior until duplication justifies extraction.
- Use `db.prepare(...).get(...)`, `.all(...)`, and `.run(...)` with positional parameters.
- Normalize Express route params before passing them to SQLite because params may type as `string | string[]`.

```ts
const itemId = getRouteParam(req.params.itemId);
const item = db.prepare('SELECT * FROM gallery_items WHERE id = ? AND user_id = ?').get(itemId, userId);
```

---

## Migrations

The MVP initializes tables at startup with `CREATE TABLE IF NOT EXISTS`. If schema changes become destructive or data-preserving migrations are needed, add explicit migration files before editing existing table definitions.

---

## Naming Conventions

- Tables: plural snake_case (`generation_tasks`, `gallery_items`).
- Columns: snake_case (`created_at`, `style_tags_json`).
- Public API fields: camelCase; map them explicitly at the API boundary.

---

## Common Mistakes

- Do not reintroduce native SQLite dependencies without confirming package lifecycle scripts are allowed in the environment.
- Do not expose `data/` as a static root.
- Do not store absolute file paths in API responses; return stable `/static/...` URLs.
