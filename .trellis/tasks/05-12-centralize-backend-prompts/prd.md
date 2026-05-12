# Centralize Backend Prompts

## Goal

Centralize backend prompt text/templates so prompt content is easier to review and analyze, while keeping existing generation behavior unchanged.

## What I already know

* The user wants backend prompts gathered into one file and consumed by business code via imports.
* Backend code lives in `apps/api` as a TypeScript Express service.
* Prompt-related LLM text is currently concentrated in `apps/api/src/openai-generation.ts`, mixed with OpenAI generation orchestration.
* `apps/api/src/generation.ts` also contains mock sample task prompts, but those are seed/mock data rather than provider prompt templates.
* Backend spec prefers keeping the MVP simple and extracting modules only when a section becomes hard to navigate.

## Assumptions (temporary)

* This task should centralize provider prompt strings and prompt-message builders, not database `prompt` fields or user-submitted prompt values.
* Mock gallery/task sample prompt strings should remain where they are unless needed for the central prompt-template refactor.
* No behavior, model settings, route contracts, or generated output semantics should intentionally change.

## Requirements

* Add one backend prompt module under `apps/api/src` that exports reusable prompt constants/builders.
* Move OpenAI text-generation system prompts, user prompt-message builders, and planned-image fallback prompt construction out of `openai-generation.ts` into that module.
* Keep OpenAI generation flow, validation, error handling, and public exports unchanged.
* Preserve existing prompt wording unless a small mechanical change is required for extraction.

## Acceptance Criteria

* [x] `openai-generation.ts` no longer contains the long provider prompt text blocks directly.
* [x] Business code imports prompt builders/constants from the centralized prompt module.
* [x] `pnpm --filter @dayu/api typecheck` passes.
* [x] `pnpm --filter @dayu/api lint` passes.
* [x] Root `pnpm typecheck`, `pnpm lint`, and `pnpm build` are considered; run if practical after the API checks.

## Definition of Done (team quality bar)

* Tests added/updated where behavior changes require them.
* Lint / typecheck / build green for touched package or clear explanation if not runnable.
* Docs/notes updated only if behavior or conventions change.
* Rollback is simple because the change is a mechanical module extraction.

## Out of Scope

* Changing prompt wording, generation policy, model configuration, provider options, or API contracts.
* Introducing a prompt framework, templating library, localization layer, database-managed prompts, or runtime-editable prompts.
* Refactoring unrelated route/database/mock-data code.

## Technical Notes

* Relevant spec: `.trellis/spec/backend/directory-structure.md`.
* Main file inspected: `apps/api/src/openai-generation.ts`.
* Candidate new file: `apps/api/src/prompts.ts` or `apps/api/src/openai-prompts.ts`.
* Current prompt categories found: style-reference analysis, task summary title, image prompt planning, prompt-planning user content, style-analysis user content, task-summary context, fallback planned image prompt.
