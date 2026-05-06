# 整理 trellis 升级后变更

## Goal

整理 Trellis 从 0.5.0-rc.1 升级到 0.5.1 后留下的项目内变更，确认这些变更是升级产物、没有破坏当前项目工作流，并把需要保留或提交的范围收敛清楚。

## What I already know

* 用户已升级 Trellis，并希望“整理一下”。
* 当前未激活 Trellis 任务；本任务目录已创建：`.trellis/tasks/05-06-trellis/`。
* 当前 git 变更集中在 `.trellis/.version`、`.trellis/.template-hashes.json`、`.trellis/scripts/common/active_task.py`、`.trellis/workflow.md`、`AGENTS.md`。
* 升级版本从 `0.5.0-rc.1` 变为 `0.5.1`。
* 业务代码暂无改动。

## Assumptions (temporary)

* “整理”优先指验证并规整 Trellis 升级产物，而不是修改业务功能。
* 若发现升级产生的模板/脚本不一致，应优先最小修复，不做额外重构。
* 是否提交 commit 需要用户明确确认后再做。

## Open Questions

* 是否提交 commit：需用户明确确认后再做。

## Requirements (evolving)

* 确认升级后的 Trellis 相关文件变更范围。
* 检查升级后工作流关键命令仍可用。
* 如有明显升级残留或不一致，做最小必要修正。
* 不改业务代码，除非发现 Trellis 升级直接导致业务工作流损坏。

## Acceptance Criteria (evolving)

* [x] 当前 Trellis 升级差异已分类：版本/模板 hash/脚本/workflow/AGENTS。
* [x] Trellis 当前任务解析或基础命令验证通过。
* [x] 工作树中无意外业务改动。
* [ ] 若需要提交，提交范围和信息已明确并经用户确认。

## Definition of Done (team quality bar)

* 相关检查通过或明确说明未运行原因。
* 不引入与 Trellis 升级无关的代码改动。
* 如有需要，记录保留/排除的文件范围。

## Out of Scope (explicit)

* 不实现业务功能。
* 不重构 Trellis 模板或脚本，除非升级后验证失败。
* 未经用户明确确认不创建 git commit。

## Technical Notes

* 已查看 `git status --short` 与 `git diff --stat`。
* 已查看 `.trellis/.version`、`.trellis/.template-hashes.json`、`.trellis/scripts/common/active_task.py`、`.trellis/workflow.md`、`AGENTS.md` 的 diff。
* `active_task.py` 新增单 session fallback，用于 class-2 platform sub-agent 无父 session id 时解析 active task。
* `workflow.md` 新增 class-2 平台 dispatch prompt 必须包含 `Active task: <task path>` 的约束。
* `AGENTS.md` 强化 subagent 等待/不取消/不重派规则。
* 主会话验证：`task.py validate .trellis/tasks/05-06-trellis` 通过；`task.py start .trellis/tasks/05-06-trellis` 成功；`task.py current --source` 显示 session source；`python3 -m py_compile .trellis/scripts/common/active_task.py` 通过。
* `trellis-check` 子代理验证：`.version` 为 `0.5.1`；模板 hash 仅对应 `AGENTS.md`、`active_task.py`、`workflow.md`；Trellis scripts py_compile 通过；任务 JSON/JSONL 可解析；无业务代码改动；未做文件修改。
