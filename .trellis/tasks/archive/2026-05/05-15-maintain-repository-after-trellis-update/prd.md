# Maintain repository after Trellis update

## Goal

Check and stabilize the repository after running `trellis update`, focusing only on the Trellis-managed changes it introduced and leaving application behavior untouched.

## What I already know

* The user ran `trellis update` and asked to maintain the repository.
* The update changed Trellis from `0.5.13` to `0.5.15`.
* The current uncommitted Trellis update diff touches `.trellis/.template-hashes.json`, `.trellis/.version`, `.trellis/scripts/common/safe_commit.py`, and `.trellis/scripts/common/task_store.py`.
* The script changes narrow archive auto-commit staging to the archived task, source task deletion, and modified child task metadata, preventing unrelated active task directories from being bundled.

## Requirements

* Review the Trellis update diff for obvious breakage or local customization conflicts.
* Keep the maintenance scope limited to Trellis workflow/runtime files and this Trellis task metadata.
* Verify the changed Python scripts are syntactically valid.
* Verify the task system still resolves the active task and validates the current task context.
* Do not modify application frontend/backend code for this task.

## Acceptance Criteria

* [ ] Trellis update diff is reviewed and understood.
* [ ] Current Trellis task has a PRD and curated context JSONL files.
* [ ] Changed Python Trellis scripts pass syntax checks.
* [ ] `task.py current --source` and task validation work for this task.
* [ ] Final working tree contains only expected Trellis maintenance/update changes.

## Definition of Done

* Relevant verification commands have passed or any failures are documented.
* No unrelated application files are changed.
* Commit is prepared only after explicit user approval if needed.

## Out of Scope

* Business feature changes.
* Broad refactors of Trellis scripts beyond the generated update.
* Changing global Trellis/npm installation files.

## Technical Notes

* Local Trellis architecture reference: `.claude/skills/trellis-meta/references/local-architecture/overview.md`.
* Workflow source of truth: `.trellis/workflow.md`.
* This task is `.trellis/tasks/05-15-maintain-repository-after-trellis-update`.
