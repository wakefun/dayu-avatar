# Rename product to 大宇图片

## Goal

Update user-facing app/API copy so the product name changes from `大宇暗房` to `大宇图片`, excluding Trellis historical documentation and archived task records.

## Requirements

* Replace current user-facing `大宇暗房` product-name copy with `大宇图片`.
* Replace current user-facing `暗房作品` / `暗房生成` copy with equivalent `图片作品` / `图片生成` wording where it appears in app/API UI/status text.
* Do not modify `.trellis` task archives or historical Trellis documentation.
* Do not run tests for this task; user explicitly requested review-only verification because this is a simple text change.
* Review the resulting diff before committing.
* Commit the approved text changes.

## Acceptance Criteria

* [ ] No non-Trellis app/API user-facing copy still says `大宇暗房`.
* [ ] No non-Trellis app/API user-facing copy still uses the old `暗房作品` / `暗房生成` wording.
* [ ] Trellis archives and historical docs are left unchanged.
* [ ] Diff is reviewed manually.
* [ ] A git commit is created for the change.

## Definition of Done

* Text changes are committed.
* Tests are not run by request.

## Out of Scope

* Editing `.trellis` archive PRDs or historical task records.
* Running automated tests.
* Changing behavior, data models, assets, or styling.

## Technical Notes

* Initial search found user-facing occurrences in `apps/api/src/generation.ts`, `apps/api/src/mappers.ts`, `apps/web/index.html`, `apps/web/public/manifest.webmanifest`, and several `apps/web/src` components/pages.
