# 统一 CSS 到 Tailwind 并优化 UI

## Goal

将 `apps/web` 现有基于 `src/styles.css` 的全局样式体系迁移为 Tailwind CSS 驱动的组件内样式，实现“页面视觉仍保持温润、玻璃卡片、移动端优先”的既有产品方向，同时消除单个 900+ 行全局样式文件的耦合，并顺手提升若干页面的细节观感与层次。

## What I already know

* 当前前端是 `apps/web` 下的 React + TypeScript + Vite 移动端 SPA。
* 样式入口为 `apps/web/src/main.tsx`，统一引入 `apps/web/src/styles.css`。
* 当前几乎所有视觉样式都集中在 `apps/web/src/styles.css`，通过语义类名供组件和页面消费。
* 共享 UI 原语已经较清晰：`AppShell`、`PageSection`、`UploadCard`、`ChipGroup`、`Cards`、`ImageLightbox`。
* 组件规范要求继续保持移动端优先、顶部导航 + 侧边抽屉、不引入底部 Tab，上传/图库/结果图的交互契约也已有明确约束。
* 用户明确要求：CSS 全部使用 Tailwind CSS；先整体分析理解项目中的 CSS 架构，再实施修改；若发现可明显优化美观的 UI，可直接调整，无需额外确认。

## Assumptions (temporary)

* 允许新增 Tailwind 及其 Vite/PostCSS 所需开发依赖与配置文件。
* 可以保留极少量真正需要运行时数值的 `style` 内联样式，例如背景图、图片纵横比与进度宽度。
* 迁移目标是删除或基本清空现有业务样式类体系，而不是保留“Tailwind + 大量旧全局类”双轨并存。

## Requirements (evolving)

* 为 `apps/web` 接入 Tailwind CSS，并完成构建链路配置。
* 将页面与组件中的主要视觉样式迁移为 Tailwind utility class。
* 保留现有产品交互契约：顶部导航、抽屉、图片预览、上传卡片 1/2/3 宫格、图库 masonry、结果图不裁切等。
* 在迁移过程中优先复用现有共享组件，而不是复制粘贴样式。
* 可在不改变核心功能的前提下，直接优化界面层次、留白、字体层级、卡片质感与按钮观感。
* 最终不再依赖现有 `styles.css` 中的大量业务类名体系。

## Acceptance Criteria (evolving)

* [ ] `apps/web` 已接入 Tailwind，并能正常通过构建。
* [ ] `AppShell`、主要页面组件、共享卡片/按钮/上传/预览组件已改用 Tailwind class 驱动样式。
* [ ] `apps/web/src/styles.css` 不再承载当前业务 UI 的大体量类名样式；仅保留 Tailwind 基础入口或必要极少量全局基础样式。
* [ ] 登录、生成、加载、结果、图库、队列、历史、设置页面在视觉上保持一致且可用。
* [ ] 上传参考图、打开图片预览、抽屉导航、生成按钮、结果页、图库瀑布流等关键路径未回归。
* [ ] `pnpm --filter @dayu/web lint`、`typecheck`、`build` 通过。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Technical Approach

* 先接入 Tailwind 构建链，再从共享原语向页面辐射迁移：`AppShell` → `PageSection` → `UploadCard` / `Cards` / `ImageLightbox` / `ChipGroup` → 各页面。
* 用组件内 className 直接表达样式，避免继续堆积语义型全局类。
* 对重复出现的长 class 组合，优先通过现有组件边界复用，而不是过早抽象新的样式系统。
* 对动态背景图、进度宽度、按真实尺寸显示图片等场景，保留少量运行时 `style`。
* UI 优化重点放在：容器层次、渐变/模糊质感、按钮反馈、信息层级、页面节奏。

## Decision (ADR-lite)

**Context**: 当前前端样式全部集中在单一全局 CSS 文件，类名为语义化命名，跨组件耦合高，但共享原语边界已经较清楚。用户希望全面切换到 Tailwind，并允许顺手优化 UI。

**Decision**: 采用“先接入 Tailwind，再以共享组件为骨架逐步替换各页面 class”的方式进行整体迁移；不保留旧样式体系作为长期兼容层。

**Consequences**: 需要修改较多前端文件，但能显著降低全局样式耦合；短期 diff 较大，回归点主要集中在抽屉、上传栅格、图片预览和图库布局。

## Out of Scope

* 不改动后端接口、任务流转与数据结构。
* 不引入新的全局状态管理方案。
* 不把本次任务扩展为完整设计系统工程或通用组件库重构。
* 不新增与用户请求无关的业务功能。

## Technical Notes

* 前端包：`apps/web/package.json`
* 入口：`apps/web/src/main.tsx`
* 路由与壳层：`apps/web/src/App.tsx`、`apps/web/src/components/AppShell.tsx`
* 共享视觉原语：`apps/web/src/components/PageSection.tsx`、`UploadCard.tsx`、`Cards.tsx`、`ChipGroup.tsx`、`ImageLightbox.tsx`
* 当前全局样式源：`apps/web/src/styles.css`
* 相关约束来自：`.trellis/spec/frontend/component-guidelines.md`、`.trellis/spec/frontend/directory-structure.md`、`.trellis/spec/guides/code-reuse-thinking-guide.md`
