# 全面检查并修复 UI 细节问题

## Goal

对 Dayu Avatar 移动端 Web UI 做一轮细节盘查和修复，重点发现并处理间距、对齐、层级、触控可达性、文字节奏和主要页面观感问题，让现有产品方向更精致一致，而不是引入新的功能或大改版。

## What I already know

* 用户要求“检查UI，彻底的盘查一些细节的问题，例如间距啥的。修复并提交”。
* 项目是 `apps/web` React + TypeScript + Vite 移动优先 SPA。
* 前端设计方向来自现有规范：暖白表面、glass/gallery cards、大圆角、顶部导航 + 侧边抽屉，不使用底部 tab。
* 已有 PWA/图库/上传/历史/设置等页面，当前任务是细节审查和视觉修正，不改变核心功能契约。

## Requirements

* 启动并使用浏览器检查主要移动端页面：登录、首页生成、队列、历史、图库、设置，能到达时也检查结果/全屏预览相关 UI。
* 重点检查并修复：页面外边距、卡片内边距、组件间距、按钮触控尺寸、文字行高/换行、移动端安全区域、抽屉/遮罩层、空状态、图片卡片比例与视觉节奏。
* 保持现有产品方向和共享 Tailwind primitives，优先修改 `ui.ts`/组件 class，而不是新增大块全局业务 CSS。
* 只做 UI polish 和明显细节缺陷修复，不新增业务功能、不改 API 契约、不做大范围重构。
* 修复后提交 git commit。

## Acceptance Criteria

* [ ] 主要页面在移动端视口下无明显挤压、错位、过窄触控目标或不一致间距。
* [ ] 侧边抽屉、顶部栏、底部按钮/预览操作在触控视口下保持可达。
* [ ] 上传、图库、历史、队列、设置等卡片的内外间距和文字层级一致。
* [ ] 空状态/错误状态不会显得贴边或视觉失衡。
* [ ] `pnpm --filter @dayu/web lint` 通过。
* [ ] `pnpm --filter @dayu/web typecheck` 通过。
* [ ] `pnpm --filter @dayu/web build` 通过。
* [ ] 浏览器 smoke check 完成，无法覆盖的页面明确说明原因。
* [ ] 代码已提交。

## Definition of Done

* UI 已通过浏览器实际检查。
* Lint / typecheck / build 通过。
* 不引入新的依赖或功能范围。
* Git 工作区最终干净（除 Trellis 工作流产物按流程处理）。

## Out of Scope

* 重做视觉风格或引入全新设计系统。
* 修改后端接口、数据库、生成逻辑或认证流程。
* 新增自动化 E2E 测试框架。
* 修复与 UI 细节无关的历史遗留问题。

## Technical Approach

1. 使用现有规范和共享 UI primitives 作为约束。
2. 启动应用并用浏览器移动端视口逐页检查，记录具体 UI 缺陷。
3. 做小而集中的 Tailwind class 调整，优先提升一致性、可读性和触控体验。
4. 运行质量检查并再次浏览器验证。
5. 提交修复。

## Technical Notes

* Relevant specs: `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/directory-structure.md`, `.trellis/spec/frontend/type-safety.md`, `.trellis/spec/guides/index.md`.
* Likely touchpoints: `apps/web/src/components/ui.ts`, `AppShell.tsx`, `UploadCard.tsx`, `Cards.tsx`, `ImageLightbox.tsx`, `PageSection.tsx`, and pages under `apps/web/src/pages/`.
