# Update homepage default avatar settings

## Goal

Set the homepage generation defaults to the requested product baseline: image ratio 1:1 and resolution 2K.

## Requirements

- Homepage generation settings default to ratio `1:1`.
- Homepage generation settings default to resolution `2k` / label `2K`.
- Missing prefill size data should fall back to the same new defaults.
- Keep existing quantity default unchanged at `1`.

## Acceptance Criteria

- [ ] Fresh homepage state highlights `1:1` for 图片比例.
- [ ] Fresh homepage state highlights `2K` for 图片分辨率.
- [ ] Missing/invalid prefill size parses to `1:1` + `2k`.
- [ ] Frontend lint/typecheck/build pass or any inability to run is documented.

## Definition of Done

- Lint / typecheck / build green for `@dayu/web`.
- Change is committed after verification.

## Out of Scope

- Backend generation behavior changes.
- UI layout or styling changes beyond selected defaults.

## Technical Notes

- Relevant spec: `.trellis/spec/frontend/component-guidelines.md` states homepage controls include ratio `1:1`, `3:4`, `9:16` and resolution `1K`, `2K`, `4K`.
- Target file: `apps/web/src/pages/GeneratePage.tsx`.
