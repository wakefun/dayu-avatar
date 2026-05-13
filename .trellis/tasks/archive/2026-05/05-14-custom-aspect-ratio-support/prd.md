# Custom Aspect Ratio Support

## Goal

Allow users to manually set a custom image aspect ratio, and map that ratio to OpenAI-compatible image dimensions so generated requests satisfy the image API size constraints.

## What I already know

* The user wants a new feature for manual custom aspect ratio input.
* The generated dimensions must follow OpenAI image API requirements.
* The implementation should be minimal and aligned with existing image generation flow.

## Assumptions (temporary)

* Existing UI already has preset ratio/size controls that can be extended.
* Custom ratios should be converted to the nearest supported OpenAI image size rather than sending arbitrary dimensions if the API does not allow them.
* The feature should apply to image generation requests only, not unrelated upload/crop flows unless they share the same size contract.

## Requirements

* Users can manually configure a custom aspect ratio in addition to existing preset ratios and auto ratio.
* Custom ratios accept simple positive numeric `宽:高` input and preserve the requested ratio as closely as OpenAI constraints allow.
* Requests sent to OpenAI use only `WIDTHxHEIGHT` values compatible with the current `gpt-image-2` path: max edge 3840, both edges multiples of 16, total pixels between 655,360 and 8,294,400, and long:short ratio no wider than 3:1.
* Existing preset ratio and auto-ratio behavior remains intact.
* History/result prefill should recover a custom ratio when the stored size is not closest to an existing preset.

## Acceptance Criteria

* [ ] User can select a custom ratio mode and enter a ratio in the UI.
* [ ] Custom ratio is converted to an OpenAI-compliant image size before generation.
* [ ] Invalid custom ratio input blocks submit with a clear UI error.
* [ ] Existing preset ratio and auto-ratio generation still works.
* [ ] Regenerate/prefill preserves custom ratio intent when a stored size does not match a preset closely.
* [ ] Lint/typecheck/tests or equivalent checks pass.

## Definition of Done (team quality bar)

* Tests added/updated where appropriate.
* Lint / typecheck / CI-relevant checks are green.
* UI behavior verified in browser if frontend changes are made.
* Rollout/rollback considered if risky.

## Out of Scope (explicit)

* Changing image model/provider selection beyond what size mapping requires.
* Supporting arbitrary pixel dimensions if OpenAI only accepts enumerated sizes.
* Refactoring unrelated generation, upload, or result display code.

## Technical Approach

Use the existing frontend ratio/resolution controls as the entry point. The custom ratio mode parses positive numeric `宽:高` input, maps it onto the selected resolution base, then reuses the existing OpenAI-compatible size normalization path before sending `generationParams.size`.

## Decision (ADR-lite)

**Context**: OpenAI `gpt-image-2` supports arbitrary constrained `WIDTHxHEIGHT`, while older image models use fixed sizes.
**Decision**: Keep this feature scoped to the repo's current `gpt-image-2` path and normalize custom ratios into constrained dimensions instead of snapping them to the existing preset list.
**Consequences**: Users get manual ratio control without changing the API contract; deployments using older or third-party image models still rely on backend normalization/provider compatibility.

## Technical Notes

* `apps/web/src/pages/GeneratePage.tsx` owns generation settings UI and computes `generationParams.size`.
* `apps/api/src/image-utils.ts` also normalizes arbitrary `WIDTHxHEIGHT` as the backend boundary guard.
* Existing `auto` ratio remains first-style-reference only and snaps to the nearest explicit preset.

## Research References

* [`research/openai-image-size-constraints.md`](research/openai-image-size-constraints.md) — OpenAI `gpt-image-2` accepts arbitrary constrained `WIDTHxHEIGHT`; older models use fixed sizes.
