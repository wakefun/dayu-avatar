# Add generated result fine-tune button

## Goal

Add a `微调` action to the generated result page so a user can enter adjustment text and immediately create a new generation task that uses the completed generated image as the new source image, with the adjustment text as the main prompt and the original task image size reused.

## Requirements

* On `/generate/result/:taskId`, show a `微调` button for completed tasks with an available generated result image.
* Clicking `微调` reveals a text input area plus confirm/cancel controls.
* Confirming with non-empty adjustment text creates a new generation task immediately; it must not navigate back to the home form first.
* The new task uses the current generated result asset as the sole source/original image.
* The new task uses the user-entered adjustment text as `prompt`.
* The new task reuses the current task `generationParams.size`, plus the same model/quality/output format unless backend defaults are needed.
* The new task records `sourceTaskId` as the current completed task id.
* After creation, route to the new task loading page.
* Keep existing `重新生成` behavior unchanged: it still navigates home with editable prefilled state.
* Surface concise Chinese validation and API error messages on the result page.

## Acceptance Criteria

* [ ] Result page renders a `微调` button for completed results with `imageUrl`.
* [ ] Clicking `微调` shows a textarea for adjustment text.
* [ ] Empty adjustment confirmation is blocked before API call with a Chinese validation message.
* [ ] Valid confirmation calls a backend endpoint that creates a task using the generated result asset as source image and the entered text as prompt.
* [ ] New task keeps the same `generationParams.size` as the source task.
* [ ] New task response has `sourceTaskId` equal to the source task id.
* [ ] UI navigates to `/generate/loading/:newTaskId` after successful creation.
* [ ] Existing save/download/重新生成/gallery actions still work.
* [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
* [ ] Browser smoke verifies the result-page fine-tune happy path in mock mode when practical.

## Definition of Done

* Implementation follows existing frontend/backend contracts and shared UI primitives.
* Cross-layer API types are updated in `apps/web/src/lib/types.ts` / `api.ts` if the payload shape changes.
* Backend validates ownership and task/result state before creating the derived task.
* No destructive data operations are introduced.
* Code is committed and pushed after verification, per user request.

## Technical Approach

Add a dedicated backend action such as `POST /api/generation-tasks/:taskId/fine-tune` instead of exposing raw generated asset IDs in general result payloads. The route will validate that the source task belongs to the user, is completed, has a result, and that the generated result asset is present and owned. It will create a new generation task with `personalReferenceAssetIds: [result.image_asset_id]`, no style references, the submitted prompt, the source task size/model/quality/output format, and `sourceTaskId` set to the source task id. Backend image-generation code should allow `generated_result` assets wherever provider code consumes personal/source images for this derived task.

The result page will manage local fine-tune form state, call the typed API helper, disable duplicate submits, show errors inline, and navigate to the loading page for the new task.

## Decision (ADR-lite)

**Context**: The frontend currently receives generated image URLs but not generated result asset IDs, while task creation accepts asset ID arrays and validates uploaded categories. Exposing all raw result asset IDs broadly would widen the API surface.

**Decision**: Add a source-task-scoped fine-tune endpoint that derives the generated result asset server-side.

**Consequences**: The frontend stays simple and cannot spoof arbitrary generated asset IDs through the generic create endpoint. The backend must explicitly support `generated_result` as a source asset for derived tasks, while the public create endpoint can keep validating ordinary user uploads as `personal_reference` / `style_reference`.

## Out of Scope

* Editing or replacing the home-page generation form.
* Multi-image fine-tune or quantity > 1 for this flow.
* Saving generated images into upload/reference categories.
* Exposing internal planned prompts.
* Changing `重新生成`, record retry, gallery, or delete behaviors.

## Technical Notes

* Result page: `apps/web/src/pages/ResultPage.tsx`.
* Generic task creation helper: `apps/web/src/lib/api.ts`.
* API route area: `apps/api/src/routes.ts`.
* Task creation service: `apps/api/src/generation.ts`.
* Result rows contain internal `image_asset_id`; mapper currently returns only URLs.
* Provider image generation consumes `personal` assets through `getTaskReferenceAssetIds` and `getAsset`.
* Relevant specs: `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/type-safety.md`, `.trellis/spec/backend/database-guidelines.md`, `.trellis/spec/backend/error-handling.md`, `.trellis/spec/guides/cross-layer-thinking-guide.md`.
