# Record page failed delete button and compact card buttons

## Goal

Improve the records page actions so failed records can be removed, and card action buttons are visually compact instead of stretching as one full-width button per row.

## What I already know

* User wants a delete record button added for failed records on the records page.
* User wants card button sizing adjusted because current actions are one per line and too long.
* Scope should stay minimal: records page UI and the deletion flow needed for failed records.

## Assumptions (temporary)

* Delete should be available only when a record is in a failed/error state.
* Existing deletion API or local record removal pattern should be reused if present.
* Buttons should wrap inline/compactly within the card instead of occupying full card width.

## Open Questions

* None currently blocking; infer reasonable UI defaults from existing patterns.

## Requirements (evolving)

* Show a delete action for failed records only.
* Use the project's existing delete/removal pattern if available.
* Make record card action buttons compact rather than full-width single-row actions.
* Keep changes surgical and limited to this feature.

## Acceptance Criteria (evolving)

* [x] Failed records show a delete button on the records page.
* [x] Non-failed records do not show the failed-record delete button.
* [x] Clicking delete removes the failed record using existing app data flow.
* [x] Record card action buttons no longer render as one full-width button per line.
* [x] Relevant lint/type/test checks pass.
* [x] UI is exercised in a browser if the app can run locally.

## Definition of Done (team quality bar)

* Tests added/updated where appropriate.
* Lint / typecheck / CI-relevant checks pass where available.
* Docs/notes updated only if behavior changes require it.
* Rollout/rollback considered if risky; this UI-only change is low risk.

## Out of Scope (explicit)

* Adding delete support for successful or in-progress records.
* Redesigning the full records page.
* Changing record generation, retry, or persistence semantics beyond failed-record deletion.

## Technical Notes

* Task directory: `.trellis/tasks/05-08-record-page-failed-delete-button-and-compact-card-buttons`.
* Implemented `DELETE /api/records/:taskId` for user-owned failed records only.
* Records page uses compact chip buttons and removes deleted failed records from local state after API success.
* Verified with `pnpm typecheck`, `pnpm lint`, `pnpm build`, and mock-mode browser smoke test.
