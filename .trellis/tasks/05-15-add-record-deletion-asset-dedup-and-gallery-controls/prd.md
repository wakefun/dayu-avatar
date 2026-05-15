# Add record deletion, asset deduplication, and gallery controls

## Goal

Add safer deletion/cancellation flows and reduce static asset duplication: records should support soft deletion, in-progress generation tasks should be cancellable, uploaded/generated images should be stored once by content hash, and gallery images should be removable or navigable back to their record detail.

## What I already know

* User requested completed records can be deleted from the records page.
* User requested in-progress tasks can be cancelled, and cancelled tasks should be automatically deleted.
* User requested uploaded images and generated WebP images should be hash processed; the record should store file hashes; duplicate content hashes should reuse a single stored file.
* User requested gallery images can be removed from the gallery.
* User requested gallery images can navigate to record details.
* User requested deleting a record should warn if corresponding images are in the gallery and will also be deleted from the gallery.
* User requested all deletes are soft deletes: database rows are marked, while actual static resources are retained.

## Assumptions (temporary)

* "删除记录" means hide the record from normal record lists/detail navigation by setting a deleted marker in the database, not removing files.
* "取消任务后自动删除任务" means an in-progress generation record/task is cancelled and then soft-deleted so it disappears from normal records/tasks views.
* Gallery removal means removing/hiding the gallery association, not deleting the image file.
* Hash deduplication should happen at server-side storage boundaries for both uploaded source files and generated WebP outputs.

## Open Questions

* None blocking. The user's wording says record deletion should warn that related gallery images will also be deleted, so MVP will soft-delete those gallery entries automatically after confirmation.

## Requirements (evolving)

* Records page supports deleting completed records.
* In-progress records/tasks support cancellation.
* Cancelling an in-progress task automatically deletes that task/record from normal views.
* Uploaded images and generated WebP images are hashed.
* Stored record metadata includes file hash values.
* If a file with the same hash already exists, reuse the existing stored file instead of writing another copy.
* Gallery images support "remove from gallery".
* Gallery images support navigating to their record detail.
* Record deletion warns when images from that record are currently in the gallery and will be removed from gallery.
* Delete operations are soft deletes in the database; static resource files remain on disk.

## Acceptance Criteria (evolving)

* [ ] A completed record can be deleted from the records UI and no longer appears in normal record lists.
* [ ] An in-progress task can be cancelled from the UI and then no longer appears in normal task/record lists.
* [ ] Deleting/cancelling updates database delete markers instead of physically deleting rows or static files.
* [ ] Uploading the same source image content twice stores one physical file and both records reference the same path/hash.
* [ ] Generating the same WebP image content twice stores one physical file and both records/images reference the same path/hash.
* [ ] Record metadata/API responses expose the relevant source/generated file hash values where needed.
* [ ] A gallery image can be removed from the gallery without deleting the underlying static file.
* [ ] A gallery image can navigate to its associated record detail.
* [ ] Deleting a record with gallery images shows a warning that those gallery entries will also be removed.

## Definition of Done (team quality bar)

* Tests added/updated where appropriate.
* Lint/typecheck/test commands pass or known failures are documented.
* Frontend flows are exercised in a browser if a local dev server can run.
* Docs/spec notes updated if a reusable behavior contract emerges.

## Out of Scope (explicit)

* Physically removing static resource files from disk.
* Building a restore/undelete UI unless already present and only requires minor wiring.
* Migrating or garbage-collecting historical duplicate files unless needed for current schema compatibility.

## Technical Approach

* Add `content_hash` to `file_assets`, `deleted_at` to `generation_tasks` and `gallery_items`, and filter normal queries by `deleted_at IS NULL`.
* Store uploaded and generated assets via content-hash lookup: if the same user/category/hash exists, reuse the existing asset row and static path; otherwise write once and insert metadata with the hash.
* Record delete endpoint will soft-delete the task and soft-delete any active gallery items connected to its result.
* Gallery delete endpoint will soft-delete the gallery item and clear `generation_results.saved_to_gallery`.
* Add a cancel endpoint for active tasks; it sets status to `canceled`, marks `deleted_at`, and normal record/queue APIs hide it.
* Frontend uses app-level confirmation dialogs, not system dialogs, for destructive actions.

## Decision (ADR-lite)

**Context**: The app currently physically deletes failed records/gallery rows and does not deduplicate assets. The requested behavior needs visible deletion while preserving static resources.
**Decision**: Use soft-delete columns for records/gallery rows and hash-based asset row reuse at write boundaries.
**Consequences**: Existing duplicated files remain until a separate migration/GC task; newly written duplicate content reuses an existing asset row/path.

## Technical Notes

* Task directory: `.trellis/tasks/05-15-add-record-deletion-asset-dedup-and-gallery-controls`.
* Repository is a pnpm workspace with `apps/api` and `apps/web`.
* Main backend files: `apps/api/src/database.ts`, `apps/api/src/assets.ts`, `apps/api/src/generation.ts`, `apps/api/src/routes.ts`, `apps/api/src/mappers.ts`, `apps/api/src/types.ts`.
* Main frontend files: `apps/web/src/pages/RecordsPage.tsx`, `apps/web/src/pages/LoadingPage.tsx`, `apps/web/src/pages/GalleryPage.tsx`, `apps/web/src/components/Cards.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/types.ts`.
