# fix failed record delete for multi image generation

## Goal

Fix the Records page delete flow so failed records created from a generation request with quantity greater than 1 can be deleted reliably.

## What I already know

* The generation form supports quantities 1, 2, 3, and 6.
* The create task API creates one `generation_tasks` row per requested image and returns `tasks` when quantity is greater than 1.
* The Records page navigates to `/records` for multi-task submissions and shows each task as a record.
* Failed records render a `删除记录` action and call `DELETE /api/records/:taskId`.
* The backend delete endpoint only permits `status = 'failed'`, then deletes that `generation_tasks` row.
* Local inspection shows no database foreign-key constraint that would block deleting a failed task row directly.
* The Records page has an SSE first-page merge path that re-adds incoming first-page rows into local state after local deletion.

## Requirements

* Deleting a failed record must remove it from the visible Records page and keep it removed after the records SSE refreshes.
* The backend must still reject deletion of non-failed records.
* The fix should be surgical and should not add a broad batch/group deletion feature unless required by the actual root cause.

## Acceptance Criteria

* [x] A failed record can be deleted from the Records page local state after API success.
* [x] The deleted record does not reappear due to the first-page records stream merge in the state-merge regression simulation.
* [x] Failed single records continue to use the same delete path.
* [x] Non-failed records remain non-deletable because the backend endpoint remains failed-only.
* [x] Typecheck/lint/build pass for the touched frontend package.

## Definition of Done

* Tests or an equivalent reproducible verification cover the failing flow.
* Lint/typecheck are green for the changed code.
* UI behavior is verified if a local dev server can be run.

## Technical Approach

Track IDs successfully deleted during the current Records page session and filter them from both paginated fetches and the records SSE first-page merge. This keeps the UI consistent with the user's local delete action even when the stream returns a snapshot before deletion has propagated through the current list merge.

## Decision (ADR-lite)

**Context**: The backend delete endpoint can delete an individual failed task, but the Records page continuously merges server snapshots and can reintroduce rows the user just removed locally.
**Decision**: Treat successful delete responses as a local tombstone in `RecordsPage` and apply that tombstone to all record list updates.
**Consequences**: This is a UI consistency fix, not a persisted batch grouping model. If future product behavior needs deleting an entire multi-image batch as one unit, that should add explicit batch identity to tasks.

## Out of Scope

* Adding a persistent generation batch/group table.
* Deleting completed or canceled records.
* Changing retry/regenerate behavior.
* Removing generated assets from disk for completed records.

## Technical Notes

* `apps/api/src/routes.ts` has `DELETE /api/records/:taskId` at lines around 538-553.
* `apps/web/src/pages/RecordsPage.tsx` merges SSE snapshots in `mergeFirstPage` and removes local rows in `deleteFailedRecord`.
* `apps/api/src/generation.ts` creates multiple independent tasks with `sourceTaskId: null` when quantity is greater than 1.
* Frontend checks passed: `pnpm --filter @dayu/web lint`, `pnpm --filter @dayu/web typecheck`, `pnpm --filter @dayu/web build`.
* Regression simulation passed: a deleted task id remains hidden after applying a records first-page merge.
* Browser smoke was attempted but blocked because the current local API dev server fails to start with missing `@ai-sdk/openai` / `ai` modules; see `research/browser-delete-smoke.md`.
* API lint passed, but API typecheck is currently blocked by pre-existing `openai-generation.ts` dependency/type errors unrelated to this frontend fix.
