# Fix PWA install menu highlight state

## Goal

Fix the side drawer PWA install action so it no longer appears as the currently selected menu item. The install action should remain available when the browser exposes the PWA install prompt, but visually behave like an action item rather than active navigation.

## Requirements

* Keep the existing side drawer install action and browser install prompt behavior.
* Change only the install menu item's visual selected/highlighted state.
* Hide the install menu item when the app is already installed or when the browser does not expose an install prompt.
* Do not alter route navigation, PWA configuration, or install prompt state management beyond the visibility condition needed for this fix.

## Acceptance Criteria

* [ ] The “添加到桌面” drawer action no longer uses the active navigation item appearance by default.
* [ ] The install action still has a visible hover/touch affordance when shown.
* [ ] The install action is hidden when `beforeinstallprompt` is unavailable or the app is already installed.
* [ ] Frontend lint, typecheck, and build pass.
* [ ] Browser smoke check confirms the drawer renders without the install action looking selected.

## Definition of Done

* Minimal code change implemented.
* `pnpm --filter @dayu/web lint`, `pnpm --filter @dayu/web typecheck`, and `pnpm --filter @dayu/web build` pass.
* UI checked in a browser if the app can be run locally.

## Technical Approach

The bug is in `AppShell`: the install action button uses the same `bg-white/82 text-[#2f2724]` treatment as active `NavLink` items. Adjust the install button classes to the neutral drawer action treatment used by inactive nav items, while retaining hover and active feedback. In `App`, only pass `showInstallAction` when the app is not already installed and an install prompt is available.

## Decision (ADR-lite)

**Context**: The install action is not route navigation and should not appear selected.
**Decision**: Use neutral action styling for the install button rather than active nav styling.
**Consequences**: The drawer visually distinguishes navigation selection from install action availability without changing behavior.

## Out of Scope

* PWA manifest or service worker changes.
* Changes to install prompt lifecycle logic.
* Broader drawer redesign.

## Technical Notes

* Inspected `apps/web/src/components/AppShell.tsx` and `apps/web/src/App.tsx`.
* Relevant spec: `.trellis/spec/frontend/component-guidelines.md`, especially sidebar install action and drawer accessibility expectations.
