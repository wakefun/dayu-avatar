# Show Reference Images on Result Page

## Goal

Improve the result page by showing the task's source images and style reference images at the top of the generation-parameters card when they exist, so users can visually review what inputs produced the result.

## What I already know

* The user wants the result page generation-parameters card header/top area to display original/source images and reference images if present.
* Result route is `apps/web/src/pages/ResultPage.tsx`.
* `ResultPage` already fetches `GenerationTask` via `api.getTask(taskId)` and has `task.personalReferenceAssets` and `task.styleReferenceAssets` available.
* The existing generation-parameters section already shows counts for `原图` and `参考图`.
* Frontend specs require any displayed image module to open fullscreen preview where practical, and result/gallery/reference images should handle nullable dimensions.
* Existing shared `ImageLightbox` supports image preview with dimensions and metadata.

## Assumptions

* “生成参数卡片的头部” means inside the existing `PageSection title="生成参数"`, above the current `<dl>` rows.
* Display only when at least one source/reference asset exists.
* Keep existing data contracts unchanged; use the assets already present on `GenerationTask`.
* Use compact thumbnails and preserve aspect behavior without introducing new API calls.

## Requirements

* On the result page, render source images (`原图`) and style reference images (`参考图`) at the top of the generation-parameters section when present.
* Separate source/reference groups with clear labels.
* Each thumbnail should use `asset.fileUrl`, a clear alt label, and handle missing width/height safely.
* Clicking a thumbnail should open the existing fullscreen `ImageLightbox` preview.
* Keep existing result image preview, save/download/regenerate/gallery actions, and parameter rows behavior unchanged.

## Acceptance Criteria

* [x] Result page shows a compact reference-image area above the parameter rows when source/reference assets exist.
* [x] No reference-image area is rendered for tasks with no source/reference assets.
* [x] Source images and style reference images are visually labeled separately.
* [x] Clicking a displayed source/reference thumbnail opens fullscreen preview.
* [x] `pnpm --filter @dayu/web typecheck`, `pnpm --filter @dayu/web lint`, and `pnpm --filter @dayu/web build` pass.
* [x] Browser smoke check covers the result page and verifies no horizontal overflow.

## Definition of Done

* Touched package checks pass.
* Browser smoke test is performed for the UI change, or a clear reason is recorded if not possible.
* No backend/API contract changes are introduced.

## Technical Approach

Use the existing `task.personalReferenceAssets` and `task.styleReferenceAssets` arrays in `ResultPage`. Add small page-local helpers/state for reference thumbnail preview and render a labeled thumbnail strip before the existing `<dl>` in the `生成参数` section. Reuse `ImageLightbox` for both generated-result preview and reference-thumbnail preview by deriving the active image object from state.

## Decision (ADR-lite)

**Context**: The data is already fetched by `ResultPage`; adding another API call or shared component would be unnecessary for this small page-specific display.
**Decision**: Implement locally in `ResultPage` using existing task assets and `ImageLightbox`.
**Consequences**: Minimal code and no contract changes. If the same reference display is later needed on records/history, extract a shared component then.

## Out of Scope

* Backend changes or API payload changes.
* Upload-time style analysis or new prompt behavior.
* Reworking the result page layout beyond the generation-parameters card top area.
* Adding captions/actions beyond previewing the displayed reference images.

## Technical Notes

* Relevant specs: `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/type-safety.md`, `.trellis/spec/frontend/directory-structure.md`.
* Main file inspected: `apps/web/src/pages/ResultPage.tsx`.
* Supporting types inspected: `apps/web/src/lib/types.ts`.
* Existing preview component inspected: `apps/web/src/components/ImageLightbox.tsx`.
