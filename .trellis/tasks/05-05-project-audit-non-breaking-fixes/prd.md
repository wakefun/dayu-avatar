# project-audit-non-breaking-fixes

## Goal

细致检查当前项目，找出潜在 bug 与值得优化的地方；对不涉及破坏性更新的安全问题直接修改并提交代码；对破坏性或高风险更新只列出清单，等待用户审批。

## What I already know

* 用户希望进行全面项目审计，而不是单点 bug 修复。
* 非破坏性更新可以直接修改并提交代码。
* 破坏性更新需要单独列出，等待审批后再做。
* 当前仓库在 `main` 分支，开始时工作区干净。
* Trellis 当前已有多个 active tasks，本任务为 `05-05-project-audit-non-breaking-fixes`。

## Assumptions (temporary)

* “非破坏性”包括局部 bug 修复、类型/构建问题修复、安全加固、明显无行为风险的配置或代码清理。
* “破坏性”包括依赖升级/降级、接口或数据格式变更、大规模重构、删除用户可见功能、修改 CI/CD 发布行为、需要迁移或可能影响现有用户数据的改动。
* 如测试或构建暴露问题，会优先修复根因，不绕过检查。

## Open Questions

* 无阻塞问题；审计可先从仓库现状、脚本、测试、类型、构建和静态检查开始。

## Requirements (evolving)

* 检查项目结构、脚本、配置、构建链路与主要应用代码。
* 运行可用质量检查，至少覆盖 lint/typecheck/test/build 中仓库实际提供的项目。
* 修复确认安全、局部、非破坏性的 bug 或优化点。
* 不执行破坏性操作；发现破坏性建议时记录到最终报告。
* 修复完成后提交代码，提交前检查 git diff 与状态。

## Acceptance Criteria (evolving)

* [x] 已识别项目可运行的质量检查命令。
* [x] 已运行相关质量检查并记录结果。
* [x] 已修复所有确认安全且值得本次处理的非破坏性问题。
* [x] 已列出未处理的破坏性/高风险建议及原因。
* [ ] 已提交本次非破坏性修改。

## Definition of Done (team quality bar)

* Tests added/updated where appropriate.
* Lint / typecheck / build commands pass or remaining failures are explained.
* Docs/notes updated only if behavior changes require it.
* Rollout/rollback considered for risky items; risky items remain unmodified until approval.

## Out of Scope (explicit)

* 未经审批的依赖升级/降级。
* 未经审批的接口、存储格式、路由、权限模型或部署流程破坏性变更。
* 与审计发现无关的美化、重构或功能扩展。

## Technical Notes

* 待检查：package scripts、framework/runtime、PWA 配置、主要前后端入口、测试配置、构建输出。

## Validation Results

* `pnpm lint` passed.
* `pnpm typecheck` passed.
* `pnpm build` passed.
* `git diff --check` passed.
* Browser smoke test completed: unauthenticated load passed; real mock auth was blocked because current `.env` uses OIDC; DevTools-mocked authenticated route checks covered shell/navigation/settings/gallery/queue/history/upload with noted limitations in `research/browser-smoke.md`.
* Spec updates captured for result route status gating, drawer/lightbox accessibility, and static media response headers.

## Risky / Destructive Suggestions Requiring Approval

* Replace public `/static/uploads` and `/static/generated` media URLs with authenticated media endpoints or short-lived signed URLs. This is the proper privacy fix, but it changes frontend/backend media contracts and download/rendering flows.
* Add an enforcing Content Security Policy. Low-risk headers were added, but strict CSP can break fonts, Vite assets, image previews, OIDC redirects, or provider integrations if not tested carefully.
* Remove Google Fonts or self-host fonts. This improves privacy/PWA reliability, but changes visual output and adds asset/licensing decisions.
* Introduce automated browser tests or a CI workflow. This is desirable, but adds project/process surface and may require dependency or CI policy approval.
* Replace polling with SSE/WebSockets or a data-fetching library. This could reduce stale/overlapping requests, but is an architectural behavior change.
* Migrate the hand-written PWA service worker to Workbox/Vite PWA plugin. This affects offline/install/update semantics and should be tested as a separate task.
