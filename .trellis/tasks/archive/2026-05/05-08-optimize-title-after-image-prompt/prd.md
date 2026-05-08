# 优化任务标题生成和图片 prompt 参数

## Goal

优化图片生成任务标题相关性：先生成图片生成 prompt，再用该 prompt 请求大模型生成简短中文标题；同时提升图片 prompt 规划请求的推理和服务优先级。

## Requirements

* 图片 prompt 规划请求增加 `reasoningEffort: 'high'` 和 `serviceTier: 'priority'`。
* 任务创建时不再基于原始用户输入提前生成最终标题。
* 图片生成 prompt 拿到后，使用该 prompt 请求大模型生成 6–14 个中文字符的简短标题。
* 标题需要在任务持久化记录中更新，前端通过现有任务查询/轮询能看到更新后的标题。
* OpenAI-compatible 请求改用 npm `ai` 包及其类型约束完成，不再手写 chat/image 请求。
* 拆分 `apps/api/src/index.ts`，降低单文件复杂度，同时保持现有 API 行为。
* 保持现有 fallback 行为：大模型不可用或失败时仍返回可用标题。

## Acceptance Criteria

* [ ] 有参考图的任务标题基于规划后的图片 prompt，而不是仅基于原始用户 prompt。
* [ ] 图片 prompt 规划 chat completions 请求体包含 `reasoningEffort: 'high'` 和 `serviceTier: 'priority'`。
* [ ] OpenAI-compatible chat/image 调用通过 `ai` 包/相关 provider 完成，关键参数由 TypeScript 类型校验。
* [ ] `apps/api/src/index.ts` 被拆分为更小模块，入口文件不再承载全部生成/provider 逻辑。
* [ ] 标题生成失败不影响图片生成流程。
* [ ] 类型检查通过。

## Definition of Done

* Tests added/updated where appropriate.
* Lint / typecheck green for touched package.
* Rollout/rollback considered if risky.

## Technical Approach

在 API 层复用现有 `createTaskSummary` / `normalizeTaskSummary` / fallback 逻辑，将标题生成输入扩展为可接收 planned image prompt；在 `startGenerationRun` 获取最终 image prompt 后更新 task summary，再继续调用图片生成。将 OpenAI-compatible provider 调用迁移到 `ai` 包及相关 provider 包，使用类型约束表达 `reasoningEffort` / `serviceTier` 等参数；把生成/provider 相关逻辑从 `apps/api/src/index.ts` 拆到独立模块。

## Decision (ADR-lite)

**Context**: 原逻辑在任务创建时只用用户输入和引用图数量生成标题，无法利用图片 prompt 规划对图像内容、风格和场景的理解。
**Decision**: 任务创建先使用 fallback/临时标题；生成流程拿到 planned image prompt 后再请求标题模型并更新任务记录。
**Consequences**: 标题可能在任务创建后短暂显示临时值，但最终更贴近图片 prompt；标题生成失败时保留 fallback，不阻塞生成。

## Out of Scope

* 不改前端 UI 展示逻辑。
* 不新增可配置环境变量。
* 不调整图片生成模型、质量、尺寸等非本次要求参数。
* 不做前端视觉重构。

## Technical Notes

* 主要文件：`apps/api/src/index.ts`。
* 相关函数：`createTaskSummary`、`buildTaskSummaryContext`、`buildImageGenerationPrompt`、`createPlannedImagePrompt`。
* 进一步拆分 rationale：`index.ts` 原本混合启动配置、Express 路由、OIDC/session、SQLite helper、任务/结果/资产持久化、mock 图片生成、OpenAI 生成编排和响应 mapper；本轮按这些天然边界低风险搬移，尽量不改 SQL、路由路径、env 变量或响应 shape。
* 新模块边界：`config.ts`/`utils.ts` 放环境与通用 helper，`database.ts`/`session-store.ts` 放 SQLite schema 与 session store，`auth.ts` 放 mock/OIDC/auth middleware，`assets.ts`/`mock-images.ts` 放上传/生成资产与 mock PNG，`generation.ts` 放任务生命周期与 mock/OpenAI 编排，`mappers.ts` 放 API response mapper/reference parsing，`http-utils.ts`/`pagination.ts` 放 SSE/static header/pagination helper，`routes.ts` 只注册现有 API/static/SPA/error routes，`app.ts` 负责装配应用，`index.ts` 只启动监听。
