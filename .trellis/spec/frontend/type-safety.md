# Type Safety

> Type safety patterns in this project.

---

## Scenario: Frontend generation records contracts

### 1. Scope / Trigger

- Trigger: any frontend work that consumes generation task, records, gallery, or user-avatar APIs.
- This app keeps API boundary types in `apps/web/src/lib/types.ts` and request helpers in `apps/web/src/lib/api.ts`.

### 2. Signatures

- Shared API boundary types:

```ts
export type Asset = {
  id: string;
  category: 'personal_reference' | 'style_reference' | 'generated_result' | 'generated_thumbnail';
  width: number | null;
  height: number | null;
  fileName: string;
  fileUrl: string;
};

export type GenerationTask = {
  promptSummary: string;
  personalReferenceAssetIds: string[];
  styleReferenceAssetIds: string[];
  personalReferenceAssets: Asset[];
  styleReferenceAssets: Asset[];
};
```

- Generation creation contract:

```ts
api.createTask({
  prompt,
  styleTags: [],
  personalReferenceAssetIds,
  styleReferenceAssetIds,
  quantity,
  generationParams: {
    model,
    quality,
    size,
    outputFormat,
  },
});
```

- `styleReferenceAnalysis` is not part of the frontend task-creation payload for the Darkroom MVP.
```

### 3. Contracts

- Frontend sends array-based reference ids to `POST /api/generation-tasks`; it must not send only the legacy single-id fields.
- Frontend must not request upload-time style-reference analysis in the Darkroom MVP; generation-time prompt planning is backend-owned.
- Frontend sends custom requirements as `prompt`; it must not auto-insert tags or generated snippets into the custom prompt textarea.
- Frontend sends `generationParams.size` as an OpenAI-compatible `WIDTHxHEIGHT` string; custom ratio UI state must be resolved and normalized before `api.createTask`.
- Frontend reads `promptSummary`/`summary` from API payloads instead of truncating raw prompts locally for cards.
- Records items must carry `prompt`, `styleTags`, `personalReferenceAssets`, `styleReferenceAssets`, and `generationParams` so navigation state can prefill the generation page, including recovering custom ratio mode from stored sizes that are not close to preset ratios.
- Records responses must include `pagination.nextCursor` and active terminal status data; the records page merges the SSE first page with paged results instead of choosing between queue and history shapes.
- Result/gallery/records image payloads should carry both `thumbnailUrl` and `imageUrl` when available; UI previews prefer `thumbnailUrl`, while download actions use `imageUrl`.
- Result routes must fetch task status before fetching `/result`; queued/processing tasks redirect to loading, and failed/canceled tasks show terminal copy instead of claiming a result is ready.
- Gallery items must carry `width` and `height` so masonry cards and fullscreen preview preserve image aspect ratio.
- `api.setAvatarFromGallery(galleryItemId)` returns `{ user }`; callers should refresh topbar/settings avatar from that response rather than guessing the URL.

### 4. Validation & Error Matrix

- Task creation with empty custom text and missing source/reference pair -> frontend blocks submit before API call.
- Missing `width`/`height` on the first reference image -> UI still renders, and `auto` ratio falls back to `3:4`.
- Backend returns only legacy single-id fields for old data -> frontend should rely on array fields already normalized by the API and avoid reconstructing arrays itself.
- Result route opened for a queued or processing task -> redirect to `/generate/loading/:taskId` before requesting the result endpoint.
- Result route opened for a failed or canceled task -> show terminal error/canceled copy and do not call `/api/generation-tasks/:taskId/result`.
- `setAvatarFromGallery` fails -> keep existing avatar UI until a successful response arrives.

### 5. Good/Base/Bad Cases

- Good: `GeneratePage` stores source assets and reference assets separately, then sends their id arrays plus `prompt` into `api.createTask`.
- Good: `GeneratePage` resolves `auto` from the first reference asset only and snaps it to a supported common ratio before computing `generationParams.size`.
- Good: `RecordsPage` consumes `RecordsResponse`, renders queued/processing/completed/failed/canceled items together, and paginates with `nextCursor`.
- Good: `GalleryPage` uses server-provided image dimensions rather than hard-coded portrait ratios.
- Base: image preview components accept nullable dimensions and degrade to CSS defaults when missing.
- Bad: building queue/history summary text from raw prompt in the component layer.
- Bad: duplicating API payload shapes in each page component instead of importing shared types.

### 6. Tests Required

- `pnpm typecheck` must fail if backend/frontend task contracts drift.
- Add assertions that task creation includes array-based source/reference asset ids and never includes `styleReferenceAnalysis`.
- Add assertions that `auto` ratio ignores source image dimensions, snaps the first reference image ratio to the nearest supported ratio, and falls back to `3:4` without reference dimensions.
- Add assertions that gallery/result/reference images still render when width/height are null.
- Add assertions that avatar updates refresh `user.avatarUrl` from the API response.

### 7. Wrong vs Correct

#### Wrong

```ts
api.createTask({
  personalReferenceAssetId: personalAsset.id,
  styleReferenceAssetId: styleAsset?.id ?? null,
  styleReferenceAnalysis,
});
```

#### Correct

```ts
api.createTask({
  prompt,
  styleTags: [],
  personalReferenceAssetIds: personalAssets.map((asset) => asset.id),
  styleReferenceAssetIds: styleAssets.map((asset) => asset.id),
});
```

#### Wrong

```ts
const cardTitle = task.prompt.slice(0, 24);
```

#### Correct

```ts
const cardTitle = item.summary;
```

---

## Type Organization

- SSE payload types belong in `apps/web/src/lib/types.ts` and should reuse existing `GenerationTask` / `QueueItem` aliases rather than redefining page-local stream shapes.
- Keep page-local UI state types near the page component when they are not shared outside that route.

---

## Validation

- Do not add duplicate runtime validation inside every component for trusted API shapes already normalized by the backend.
- At UI boundaries, handle `null` image dimensions and missing optional fields with display fallbacks rather than throwing.

---

## Common Patterns

- Use typed navigation state for history/result-to-home prefill flows.
- Use array-based reference asset contracts consistently from upload state through API request payloads.

---

## Forbidden Patterns

- Do not keep stale duplicate versions of task/history/gallery response shapes in page-local ad-hoc objects.
- Do not reconstruct asset arrays in the frontend from single legacy ids.
