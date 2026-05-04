# 优化 Trellis gitignore 规则

## Goal

根据 Trellis 官方/上游建议，调整当前仓库对 `.trellis` 的忽略策略，避免继续在根 `.gitignore` 中整体忽略 `.trellis`，改为“同步项目级 Trellis 资产，忽略本地/运行时状态”。这样可以让 spec、workflow、tasks 等真正的协作资产进入版本控制，同时保留开发者身份、runtime 状态和临时文件的本地性。

## What I already know

* 当前仓库根 `.gitignore` 直接写了 `.trellis`，导致整个目录都不会被 git 跟踪。
* Trellis 自带 `.trellis/.gitignore` 只忽略本地/运行时文件，例如 `.developer`、`.current-task`、`.runtime/`、`*.tmp`、`*.new` 等。
* Trellis 本地架构文档将 `.trellis/workflow.md`、`.trellis/config.yaml`、`.trellis/spec/`、`.trellis/tasks/`、`.trellis/workspace/`、`.trellis/scripts/` 视为项目内可见/可编辑的内容。
* 上游/官方建议是默认 track everything by default；如果只想本地私有，应该用 `.git/info/exclude`，而不是共享 `.gitignore`。
* `.trellis/.runtime/**` 和 `.trellis/.developer` 等被官方文档视为本地/运行时状态，不适合默认纳入版本控制。

## Assumptions (temporary)

* 这次任务只调整仓库级 `.gitignore` 规则，不改 Trellis 上游模板文件本身。
* 团队希望遵循 Trellis 官方推荐方向，但仍允许对 `workspace/` 是否同步做本地团队决策。
* 不会在本任务中重构 `.claude` / `.opencode` 的忽略策略，除非用户后续明确要求。

## Open Questions

* None. The team decision is to track `.trellis/workspace/` in git.

## Requirements (evolving)

* 移除根 `.gitignore` 对整个 `.trellis` 的整体忽略。
* 保留对 Trellis 本地/运行时状态文件的忽略。
* 允许 `.trellis/workflow.md`、`.trellis/config.yaml`、`.trellis/spec/**`、`.trellis/tasks/**`、`.trellis/scripts/**` 等项目资产进入版本控制。
* 根据团队偏好，`.trellis/workspace/**` 也进入版本控制。
* 结果应与 Trellis 官方“默认同步项目资产、本地状态单独忽略”的方向一致。

## Acceptance Criteria (evolving)

* [ ] 根 `.gitignore` 不再整体忽略 `.trellis`。
* [ ] `.trellis/.developer`、`.trellis/.current-task`、`.trellis/.runtime/`、`*.tmp`、`*.new` 等运行时/本地状态仍被忽略。
* [ ] `.trellis/spec/**`、`.trellis/workflow.md`、`.trellis/config.yaml`、`.trellis/tasks/**`、`.trellis/scripts/**` 能被 git 正常跟踪。
* [ ] `.trellis/workspace/**` 被保留为可跟踪内容，与团队选择一致。
* [ ] 最终规则能解释清楚“为什么同步这些、为什么忽略那些”。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Technical Approach

* 仅修改仓库根 `.gitignore`，把当前的 `.trellis` 全量忽略替换为精细化规则。
* 以 Trellis 官方 `.trellis/.gitignore` 作为 runtime/local-only 规则基线。
* 对项目级 Trellis 资产使用显式 `!` 反忽略，确保协作文件可被跟踪。
* `.trellis/workspace/**` 按团队决策保留为已跟踪的协作记录，而不是额外忽略。

## Decision (ADR-lite)

**Context**: 当前仓库根 `.gitignore` 整体忽略 `.trellis`，但 Trellis 上游默认把 `.trellis` 视为应纳入版本控制的项目级协作资产，只把少量本地/运行时状态留在 `.trellis/.gitignore` 中。

**Decision**: 调整根 `.gitignore`，不再整体忽略 `.trellis`；改为跟踪 `.trellis/workflow.md`、`.trellis/config.yaml`、`.trellis/spec/**`、`.trellis/tasks/**`、`.trellis/scripts/**`、`.trellis/workspace/**` 等项目资产，同时继续忽略 `.developer`、`.current-task`、`.runtime/**`、`.backup-*`、`*.tmp`、`*.new` 等本地/运行时文件。

**Consequences**: Trellis 的 spec、任务、journal 和工作流规则会进入 git 历史，便于团队协作与审阅；相应地，workspace 日志会带来一定提交噪音，但这是当前明确选择而非意外副作用。

## Out of Scope

* 不修改 `.trellis/.gitignore` 上游模板内容。
* 不改 Trellis workflow、spec、tasks 的业务内容。
* 不调整 `.claude`、`.opencode` 或其他目录的 git 策略。

## Technical Notes

* 当前根忽略规则：`.gitignore`
* 本地/运行时忽略基线：`.trellis/.gitignore`
* 本地架构说明：`.claude/skills/trellis-meta/references/local-architecture/generated-files.md`
* 上游官方研究结论：`.trellis/tasks/05-05-trellis-gitignore/research/trellis-gitignore-policy.md`
