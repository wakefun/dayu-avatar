# Audit and Fix Project Issues

## Goal

Perform a careful audit of the current Dayu Avatar project, identify likely bugs and worthwhile optimizations, apply only safe non-destructive fixes, verify them, and commit the resulting code. Potentially destructive or high-risk changes must be reported separately for approval before any modification.

## Requirements

* Inspect the current project for likely runtime bugs, build/lint/type issues, UI regressions, config pitfalls, and low-risk optimization opportunities.
* Apply only non-destructive fixes that do not delete user data, alter shared/production systems, reset history, force-push, or remove meaningful functionality.
* Preserve existing frontend architecture: React + TypeScript + Vite mobile SPA in `apps/web`, Tailwind-first styling, route wiring in `src/App.tsx`, API wrappers in `src/lib/api.ts`, shared types in `src/lib/types.ts`, and reusable UI recipes in `src/components/ui.ts`.
* For UI/frontend changes, run available validation and perform a browser smoke test if the app can be served locally.
* Create a git commit for verified safe fixes only.
* List destructive/high-risk update candidates separately without applying them.

## Acceptance Criteria

* [x] Relevant Trellis frontend and shared guides are loaded before coding.
* [x] Code/config audit findings are captured in `research/*.md` by Trellis research agents.
* [x] Only safe, non-destructive fixes are applied.
* [x] `pnpm --filter @dayu/web lint`, `pnpm --filter @dayu/web typecheck`, and `pnpm --filter @dayu/web build` pass, or blockers are documented.
* [x] Browser smoke test covers the affected golden path if frontend behavior changes.
* [x] Git diff is reviewed before commit and no likely secrets/destructive changes are included.
* [x] A git commit is created with a concise message and required co-author trailer.
* [x] Destructive/high-risk recommendations, if any, are reported for approval.

## Definition of Done

* Tests/checks are run and results reported.
* Behavior changes are verified in the browser when applicable.
* Specs/notes are updated only if new durable project conventions are learned.
* Safe fixes are committed; high-risk changes are left unapplied.

## Technical Approach

1. Load Trellis package/spec context and relevant frontend/shared guidelines.
2. Use `trellis-research` agents to audit source and config into persisted research files.
3. Review findings, inspect the exact affected files, and classify each candidate as safe or high-risk/destructive.
4. Implement the smallest safe fixes that directly address confirmed issues.
5. Run validation commands and browser smoke testing if needed.
6. Commit safe changes and report unapplied high-risk candidates.

## Decision (ADR-lite)

**Context**: The request asks for broad project quality review plus direct code changes, but destructive changes require explicit approval.

**Decision**: Use a conservative audit-and-patch approach: apply only local, reversible, low-risk fixes after validating the issue; defer destructive/high-risk updates to a report.

**Consequences**: The first pass may leave larger refactors, dependency removals, data-affecting changes, or behavior removals unapplied until reviewed, but avoids accidental loss or broad churn.

## Out of Scope

* Force-pushes, history rewrites, branch deletion, resets, or cleanup of unrelated untracked work.
* Removing dependencies, deleting files/data, or changing persistence/API contracts unless explicitly approved.
* Broad redesigns, speculative refactors, or feature additions not required by a confirmed bug.
* Publishing to external systems or modifying shared infrastructure.

## Research References

* `research/code-audit.md` — source-level bug and safe-fix findings from a Trellis research agent.
* `research/config-audit.md` — config/script/build hygiene findings from a Trellis research agent.

## Technical Notes

* Package context: single-repo mode with backend and frontend spec layers.
* Relevant frontend spec files loaded: `.trellis/spec/frontend/directory-structure.md`, `.trellis/spec/frontend/component-guidelines.md`.
* Shared thinking guides loaded: `.trellis/spec/guides/index.md`, `.trellis/spec/guides/code-reuse-thinking-guide.md`, `.trellis/spec/guides/cross-layer-thinking-guide.md`.
* Frontend validation commands from spec: `pnpm --filter @dayu/web lint`, `pnpm --filter @dayu/web typecheck`, `pnpm --filter @dayu/web build`.
