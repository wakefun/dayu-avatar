# Research: trellis-gitignore-policy

- **Query**: Official/upstream Trellis recommendation for version-controlling `.trellis`, including what should be tracked vs ignored, and whether local-only ignores should live in shared `.gitignore` or Git-local exclude mechanisms.
- **Scope**: mixed
- **Date**: 2026-05-04

## Findings

### Files Found

| File Path | Description |
|---|---|
| `.gitignore` | Current repo root ignore file; currently ignores the entire `.trellis` directory. |
| `.trellis/.gitignore` | Upstream-style Trellis local/runtime ignore file inside `.trellis/`. |
| `.trellis/tasks/05-05-trellis-gitignore/prd.md` | Task context for this repo’s gitignore decision. |

### Official Findings

- **[Explicit] Track `.trellis/` in Git as shared project state.** Official FAQ says: `Add .trellis/ and whichever .{platform}/ directories you use to git and commit.`
  - Source: https://docs.trytrellis.app/advanced/appendix-f

- **[Explicit] `.trellis/.developer` is intentionally local-only.** Official install docs say: `.trellis/.developer is a gitignored per-checkout identity file (by design, never committed), so a fresh clone never has one`.
  - Source: https://docs.trytrellis.app/start/install-and-first-task

- **[Explicit] `.trellis/workspace/` is committed, not local-only.** The same install/changelog docs say `.trellis/workspace/<name>/ cannot serve this role — it’s committed to git.`
  - Sources:
    - https://docs.trytrellis.app/start/install-and-first-task
    - https://docs.trytrellis.app/changelog/v0.5.0-beta.9

- **[Explicit] Architecture docs mark the runtime pointers as gitignored and workspace journals as tracked.** Official architecture table says:
  - `.trellis/.developer` → `yes (per-clone)`
  - `.trellis/.current-task` → `yes`
  - `.trellis/.runtime/sessions/.json` → `yes`
  - `workspace/{name}/journal-*.md` → `no (team-shared)`
  - `workspace/{name}/index.md` → `no`
  - Source: https://docs.trytrellis.app/advanced/architecture

- **[Explicit] Trellis distinguishes per-developer state from shared state.** Official multi-platform docs say:
  - `Per-developer isolation (no conflicts):`
    - `.trellis/workspace/{name}/`: each developer’s own journals and index
    - `.trellis/.developer`: gitignored
    - `.trellis/.current-task`: gitignored
  - `Shared state (coordinate via PR):`
    - `.trellis/spec/`: team conventions, PR-reviewed like any code
    - `.trellis/tasks/`: task JSONs
  - Source: https://docs.trytrellis.app/advanced/multi-platform

- **[Explicit] Trellis tasks and research outputs are durable project artifacts.** Official workflow docs say durable state lives in files, including:
  - `.trellis/tasks//` → `PRD, research, context manifests, metadata, and archived task history`
  - `.trellis/spec/` → `Team conventions and reusable lessons`
  - `.trellis/workspace//` → `Developer journals and cross-session notes`
  - Source: https://docs.trytrellis.app/start/how-it-works

- **[Explicit] Upstream `.trellis/.gitignore` is narrow and only ignores local/runtime files.** Upstream template ignores:
  - `.developer`
  - `.current-task`
  - `.runtime/`
  - `.ralph-state.json`
  - `.agents/`, `.agent-log`, `.session-id`
  - `.plan-log`
  - `*.tmp`
  - `.backup-*`
  - `*.new`
  - `**/__pycache__/`, `**/*.pyc`
  - Source: https://raw.githubusercontent.com/mindfold-ai/Trellis/main/.trellis/.gitignore

- **[Explicit] Update backups are local/runtime noise.** Official FAQ says Trellis creates automatic backups under `.trellis/.backup-*` before updates, and the architecture docs mark `.trellis/.backup-*` as gitignored.
  - Sources:
    - https://docs.trytrellis.app/guides/faq
    - https://docs.trytrellis.app/advanced/architecture

- **[Inferred] A root `.gitignore` should not ignore `.trellis` wholesale.** This follows from the explicit guidance above: official docs say to add `.trellis/` to Git, while upstream only ignores a small set of local/runtime files inside `.trellis/.gitignore`.

- **[Inferred] No explicit official Trellis doc page mentioning `.git/info/exclude` was found.** Because Trellis expects shared `.gitignore` policy to preserve tracked `.trellis/` assets, any extra personal-only ignores are best kept out of repo-wide `.gitignore`. Using `.git/info/exclude` is therefore a reasonable Git-local mechanism, but this is an inference from Git practice plus Trellis’s shared-tracking model, not an explicit Trellis rule.

### Practical Split

#### Definitely commit

Official/default Trellis behavior supports tracking these:

- `.trellis/.gitignore`
- `.trellis/workflow.md`
- `.trellis/config.yaml`
- `.trellis/.version`
- `.trellis/.template-hashes.json`
- `.trellis/spec/**`
- `.trellis/tasks/**` (including task PRDs, metadata, context JSONL, archives, and `research/*.md` outputs)
- `.trellis/workspace/**` (official docs treat journals/indexes as tracked, team-shared files)
- `.trellis/scripts/**`
- `.trellis/worktree.yaml` if present in the project

#### Definitely ignore

Official/upstream local/runtime-only set:

- `.trellis/.developer`
- `.trellis/.current-task`
- `.trellis/.runtime/**`
- `.trellis/.ralph-state.json`
- `.trellis/.agents/`
- `.trellis/.agent-log`
- `.trellis/.session-id`
- `.trellis/.plan-log`
- `.trellis/.backup-*`
- `.trellis/*.tmp`
- `.trellis/*.new`
- `.trellis/**/__pycache__/`
- `.trellis/**/*.pyc`

#### Optional by team policy

- **No `.trellis` path was found that official docs clearly present as optional.** The upstream default is to track the core `.trellis` collaboration assets and ignore only runtime/local files.
- If a team decides not to track something like `.trellis/workspace/**`, that would be a **deliberate policy deviation from upstream default**, not the documented Trellis recommendation.
- If individual developers need extra local-only ignores beyond the upstream `.trellis/.gitignore`, keeping them in **Git-local excludes** rather than the shared root `.gitignore` is **inferred best practice**, not explicitly documented Trellis policy.

### External References

- https://docs.trytrellis.app/advanced/appendix-f — FAQ statement to add `.trellis/` and platform directories to Git.
- https://docs.trytrellis.app/start/install-and-first-task — install docs describing `.developer` as gitignored and `.workspace` as committed.
- https://docs.trytrellis.app/advanced/architecture — canonical file-role tables, including which paths are gitignored.
- https://docs.trytrellis.app/advanced/multi-platform — per-developer vs shared-state split.
- https://docs.trytrellis.app/start/how-it-works — durable-state description for tasks/spec/workspace.
- https://docs.trytrellis.app/guides/faq — protected paths and `.backup-*` update behavior.
- https://docs.trytrellis.app/changelog/v0.5.0-beta.9 — repeated explicit note that `.developer` is gitignored and `.workspace` is committed.
- https://raw.githubusercontent.com/mindfold-ai/Trellis/main/.trellis/.gitignore — upstream ignore template for local/runtime files.

### Related Specs

- None found.

## Caveats / Not Found

- No explicit official Trellis mention of `.git/info/exclude` was found in docs.trytrellis.app or upstream repository materials searched.
- Current local repo diverges from upstream guidance because root `.gitignore` currently ignores the entire `.trellis` directory.
- `python3 ./.trellis/scripts/task.py current --source` returned `Current task: (none)`, so this research was persisted to the user-specified task path rather than a script-resolved active task path.
