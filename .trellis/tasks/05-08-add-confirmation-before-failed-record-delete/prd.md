# Add confirmation before failed record delete

## Goal

Prevent accidental destructive actions by requiring a custom app-styled confirmation dialog before a failed record is deleted from the records page.

## What I already know

* User explicitly corrected that the failed-record delete button is missing a confirmation dialog.
* User clarified the confirmation must be a custom UI component, not the browser/system `confirm` dialog.
* Existing implementation already has compact record card action buttons and a failed-record-only delete API.
* Scope is limited to adding confirmation before calling the existing delete flow.

## Assumptions (temporary)

* Backend behavior remains unchanged: only failed records can be deleted.
* The dialog should follow the existing warm-white glass/gallery visual direction.

## Open Questions

* None blocking.

## Requirements

* Clicking “删除记录” must open a custom app UI confirmation dialog before any delete request is sent.
* The dialog must include clear cancel and destructive confirm actions.
* Canceling confirmation must leave the record untouched and must not call the API.
* Confirming deletion must continue to remove the failed record using the existing API and local state update.
* Keep current compact button styling unchanged.

## Acceptance Criteria

* [x] Failed-record delete opens a custom app dialog before deletion, not a system confirm.
* [x] Canceling the dialog does not send `DELETE /api/records/:taskId`.
* [x] Confirming the dialog sends delete and removes the failed record.
* [x] Static checks pass.
* [x] Browser smoke test verifies cancel and confirm paths.

## Definition of Done

* Lint/typecheck/build pass where relevant.
* Browser behavior verified in mock mode.
* No unrelated UI or API changes.

## Out of Scope

* Replacing all destructive actions in the app.
* Designing a new shared modal system unless one already exists and is trivial to reuse.

## Technical Notes

* Implemented in `apps/web/src/pages/RecordsPage.tsx`.
* Uses a page-local custom dialog with `role="dialog"`, `aria-modal`, labeled/described content, cancel autofocus, Escape/overlay cancel, and explicit destructive confirm.
* Verified with `pnpm typecheck`, `pnpm lint`, `pnpm build`, and mock-mode browser smoke test.
