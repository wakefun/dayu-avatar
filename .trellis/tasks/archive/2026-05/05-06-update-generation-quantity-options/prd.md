# Update generation quantity options

## Goal

Change the homepage generation quantity candidates to match the requested product options: 1, 2, 3, and 6.

## Requirements

- The homepage `生成数量` segmented control offers `1`, `2`, `3`, and `6`.
- The default generation quantity remains `1`.
- Prefilled or restored quantity values accept `2`, `3`, and `6`; unsupported/missing values fall back to `1`.
- Update the frontend contract/spec text so future work uses the same candidate list.

## Acceptance Criteria

- [ ] `生成数量` renders options `1`, `2`, `3`, `6`.
- [ ] Selecting `3` or `6` submits the corresponding `quantity` value.
- [ ] Missing or unsupported prefill quantity falls back to `1`.
- [ ] Frontend spec no longer lists `4` or `8` as quantity candidates.
- [ ] Web lint/typecheck/build pass.

## Definition of Done

- `pnpm --filter @dayu/web lint` passes.
- `pnpm --filter @dayu/web typecheck` passes.
- `pnpm --filter @dayu/web build` passes.
- Commit includes code and Trellis task/spec updates.

## Out of Scope

- Backend task-queue concurrency behavior changes.
- Layout or styling changes unrelated to the candidate values.

## Technical Notes

- Target code: `apps/web/src/pages/GeneratePage.tsx`.
- Target spec: `.trellis/spec/frontend/component-guidelines.md`.
- Existing quantity options were `1`, `2`, `4`, `8` with default `1`.
