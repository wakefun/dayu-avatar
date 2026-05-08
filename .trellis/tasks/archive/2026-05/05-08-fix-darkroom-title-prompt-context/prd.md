# Fix Darkroom Title Prompt Context

## Goal

Fix task title generation so repeated “暗房/暗室” words are prevented by controlling the context sent to the title model, not by post-generation word replacement.

## What I already know

* The user observed many task titles containing “暗房/暗室”.
* The previous fix was wrong because it relied on output sanitization/replacement.
* The desired fix is to avoid passing product-name and “暗房/暗室” interference into the model request when asking for a task title.
* Titles should briefly summarize task characteristics: user request, subject, style, scene, source/reference presence, or concrete generation intent.
* Current backend title generation is in `apps/api/src/index.ts:createTaskSummary`.
* Current code also has `normalizeTaskSummary` and `stripGenericProductWords`, which indicates the previous post-processing approach.
* Current Trellis backend spec says summaries should strip generic filler; that should be corrected to say the title request context should exclude product filler.

## Assumptions (temporary)

* We should keep simple length/punctuation normalization, but remove semantic word replacement for “暗房/暗室”.
* The title model request should not include product brand words or negative examples that mention “暗房/暗室”, because even negative instructions can make these tokens salient.
* Fallback summaries should also avoid product words and should be derived from user prompt or asset composition.

## Open Questions

* None.

## Requirements

* Build a clean title-generation prompt that does not include product name, “暗房”, or “暗室” unless those words are present in the user's own prompt.
* Do not solve title pollution by replacing/removing “暗房/暗室” from model output.
* Keep titles short, Chinese, and focused on task characteristics.
* Keep planned image-generation prompts internal and unrelated to title generation.
* Update specs to document context hygiene for task summaries.

## Acceptance Criteria

* [x] The title model request does not pass product-brand filler or “暗房/暗室” interference from system/developer/user scaffolding.
* [x] `normalizeTaskSummary` does not contain semantic post-generation replacement for “暗房/暗室”.
* [x] Fallback titles remain concise and task-characteristic based.
* [x] Existing task/record/queue payloads still expose `summary`/`promptSummary`.
* [x] Typecheck/lint/build pass.
* [x] Relevant backend spec is updated.

## Definition of Done

* Tests/checks pass: `pnpm typecheck`, `pnpm lint`, `pnpm build`.
* Code-spec updated for the corrected title-generation contract.
* Commit created and pushed if implementation is complete.

## Technical Approach

* Change `createTaskSummary` so the title prompt describes only title-writing constraints and clean task signals.
* Build a sanitized title context from user prompt and generic asset composition labels without product words.
* Keep mechanical normalization for punctuation/length only.
* Update `getTaskSummary` to avoid semantic stripping of existing stored summaries.

## Decision (ADR-lite)

**Context**: Product words leaked into task titles because they were made salient in the title model prompt and then treated with output replacement.

**Decision**: Prevent leakage at the model-input layer by excluding product words and “暗房/暗室” from title-generation context unless user-provided.

**Consequences**: Titles should better summarize actual task content and avoid generic product filler. Old stored summaries are not semantically rewritten; they can fall back only if empty after mechanical normalization.

## Out of Scope

* Changing image-generation prompt planning.
* Changing the visible product brand UI.
* Adding a separate title-edit UI.

## Technical Notes

* Current task directory: `.trellis/tasks/05-08-fix-darkroom-title-prompt-context/`.
* Likely implementation file: `apps/api/src/index.ts`.
* Relevant spec file: `.trellis/spec/backend/error-handling.md`.
