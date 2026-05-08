# Dayu Darkroom Image Style Transfer Flow

## Goal

Upgrade the project from an automatic avatar generator into “大宇暗房”, a dedicated image-making website that recreates the style, scene, and visual language of user-provided reference images while preserving features from a user-provided source image when requested.

## What I already know

* The current project theme is automatic avatar generation; the new product theme should become “大宇暗房”.
* Users can upload an “原图” (source image) so AI can extract subject/identity/feature information.
* Users can upload one or more “参考图” (reference images) so AI can extract style, scene, composition, or drawing/painting characteristics.
* Users can enter custom requirements, and these custom requirements have the highest priority.
* On generate, the app should first call a multimodal model with the source image, reference images, and user requirements, explicitly explaining what each image means.
* The multimodal model should infer the user's likely desired outcome and produce a prompt suitable for the downstream image generation model.
* The app should then call the image generation model with the generated prompt to create the final image.
* Aspect ratio options need to add `4:3`, `16:9`, `21:9`, and `9:21`.
* A new `auto` aspect ratio should be the default option.
* When a user uploads at least one reference image, `auto` should use the first reference image’s aspect ratio by default.
* Aspect ratio behavior must stay compatible with resolution parameter constraints.

## Assumptions (temporary)

* The existing image generation API path and image upload flow should be reused where practical.
* “原图” and “参考图” are product-level roles, not necessarily two different storage systems.
* The prompt generation step should be server-side so model keys and provider details stay hidden.
* The generated image prompt remains internal for MVP; users do not see or edit it before generation.
* The MVP may break old avatar-generation compatibility because the project is still in an experimental lab stage.

## Open Questions

* None.

## Expansion Sweep

### Future evolution

* The prompt-planning step may later become an editable “AI director” layer with prompt previews, prompt history, or reusable style recipes.
* The source/reference image roles should stay explicit so future features can add masks, multi-subject identity transfer, or per-reference weighting without changing the mental model.

### Related scenarios

* Existing history/result retry should keep enough task input data to re-run a prior 大宇暗房 generation.
* Existing mock mode should still produce a coherent local demo without requiring provider keys.

### Failure and edge cases

* Prompt planning can fail separately from image generation, so task status and retry behavior should surface failures cleanly.
* `auto` aspect ratio must have a deterministic fallback when no reference image dimensions are available.

## Requirements (evolving)

* Fully replace the old avatar-specific workflow with 大宇暗房; do not keep avatar mode as a parallel compatibility path.
* Rebrand the product experience from avatar generation to 大宇暗房.
* Support source image upload for feature/identity extraction.
* Support reference image upload for style/scene/painting-style extraction.
* Treat custom user requirements as the highest-priority generation instruction.
* If the user provides no custom text requirements, both source image and reference image are required.
* If the user provides custom text requirements, source image and reference image are both optional.
* If the user provides custom text requirements and uploads neither source nor reference images, use the text requirements directly as the image-generation prompt and skip multimodal prompt planning.
* If the user provides custom text requirements and uploads source image and/or reference image, run multimodal prompt planning before image generation.
* Add a multimodal prompt-planning step before image generation when uploaded images are part of the request.
* Keep the planned image-generation prompt internal for MVP; do not add a prompt review/edit step.
* Remove or hide upload-time style-reference analysis UI from MVP; prompt planning happens at generation time.
* Add aspect ratios: `4:3`, `16:9`, `21:9`, `9:21`.
* Add `auto` as the default aspect ratio.
* If reference images exist, resolve `auto` using the first reference image’s dimensions.
* If no reference image is available, resolve `auto` to `3:4`.
* Keep aspect ratio and resolution parameters valid for the image generation backend.

## Acceptance Criteria (evolving)

* [x] The primary UI no longer presents the product as an avatar generator.
* [x] Users can distinguish and upload source image vs reference image(s).
* [x] When custom text is empty, generation is blocked unless both source image and at least one reference image are uploaded.
* [x] When custom text exists and no images are uploaded, the app sends the custom text directly as the image-generation prompt.
* [x] When any image is uploaded, Generate sends the uploaded image(s) and user requirements to a multimodal prompt-planning step with clear role labels.
* [x] Image generation uses either the direct custom text prompt or the multimodal model’s planned image-generation prompt according to the input rules.
* [x] The planned image-generation prompt is not shown for review/editing before generation in MVP.
* [x] User custom requirements override conflicting inferred source/reference guidance.
* [x] Upload-time style-reference analysis is not shown in the MVP generation form.
* [x] Aspect ratio selector includes `auto`, `1:1`, existing supported ratios, plus `4:3`, `16:9`, `21:9`, and `9:21` where applicable.
* [x] `auto` defaults to the first reference image’s aspect ratio when available.
* [x] `auto` resolves to `3:4` when no reference image is available.
* [x] Resolution options remain valid for the selected or resolved aspect ratio.
* [x] Lint/typecheck/tests pass for touched packages.

## Definition of Done (team quality bar)

* Tests added/updated where appropriate.
* Lint / typecheck / CI-equivalent checks pass.
* Docs/notes updated if behavior changes need to be preserved in Trellis specs.
* Rollout/rollback considered if risky.

## Decision (ADR-lite)

**Context**: The existing project is avatar-generation oriented, but the product direction is now a broader image-making studio that reproduces reference image style/scene/painting language using user-uploaded source and reference images.

**Decision**: Fully replace the old avatar workflow with 大宇暗房 for MVP. Do not add a separate avatar mode or compatibility layer.

**Consequences**: This allows simpler product language, fewer mode branches, and cleaner API/UI naming, but may break old avatar-specific assumptions in history/result/retry flows. That is acceptable because the project is still in an experimental lab stage.

## Technical Approach

* Keep one primary generation form branded as 大宇暗房.
* Treat source images and reference images as distinct role-labeled inputs.
* Validate inputs before task creation using the custom-text/image presence rules.
* At task creation, choose one prompt path:
  * text-only request: use custom text directly as the image-generation prompt;
  * any uploaded image: call the multimodal prompt-planning model with role-labeled images and user text, then use its planned prompt internally.
* Remove or hide upload-time style-reference analysis from the primary form.
* Resolve `auto` aspect ratio before image generation: first reference image ratio if available, otherwise `3:4`; then normalize dimensions according to resolution constraints.
* Preserve task polling/loading/result/retry behavior while updating stored task inputs to represent 大宇暗房 concepts.

## Out of Scope (explicit)

* Preserving the old avatar-specific workflow as a parallel mode.
* Showing upload-time style-reference analysis in the MVP generation form.

## Technical Notes

* Task directory: `.trellis/tasks/05-08-dayu-darkroom-image-style-transfer-flow/`.
* Frontend generation flow is centered in `apps/web/src/pages/GeneratePage.tsx`, with uploads handled by `apps/web/src/components/UploadCard.tsx` and API calls in `apps/web/src/lib/api.ts`.
* Frontend state already separates personal/source-like assets from style/reference assets as `personalAssets` and `styleAssets`.
* Current frontend generation options include ratio, resolution, quantity, and `normalizeImageSize(ratio, resolution)` before `api.createTask(...)`.
* Backend routes and orchestration are concentrated in `apps/api/src/index.ts`.
* Backend already has `/api/uploads`, `/api/style-reference-analysis`, `/api/generation-tasks`, task polling/streaming/result/retry routes, and OpenAI-compatible mock/openai modes.
* Backend already uses `/v1/chat/completions` for style analysis/task summary and `/v1/images/edits` for image generation.
* README documents `OPENAI_PROMPT_MODEL` for reference analysis and final prompt generation.
* Trellis specs require API errors to use `{ error: { code, message } }`, upload byte validation for PNG/JPG/WEBP, typed frontend API contracts, and mobile art-gallery UI conventions.
