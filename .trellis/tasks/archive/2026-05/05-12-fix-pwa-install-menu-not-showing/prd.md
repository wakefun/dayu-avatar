# 修复 PWA 安装菜单不显示

## Goal

修复侧边栏 PWA 安装入口在普通浏览器环境中完全不显示的问题，让用户仍能看到安装入口；当浏览器提供安装提示时可触发原生安装流程，已安装/standalone 模式下继续隐藏该入口。

## What I already know

* 用户反馈：当前 PWA 安装菜单直接不显示。
* 相关代码集中在 `apps/web/src/App.tsx` 与 `apps/web/src/components/AppShell.tsx`。
* 当前实现把菜单渲染条件绑定到 `Boolean(installPrompt) && !installedDisplayMode`，浏览器未触发 `beforeinstallprompt` 时菜单项会被移除。
* 前端组件规范要求侧边栏安装 action 在可用时调用浏览器安装提示，否则保持无害。

## Requirements

* 普通浏览器环境中侧边栏保留 PWA 安装入口。
* 捕获到 `beforeinstallprompt` 时，点击入口触发浏览器安装提示。
* 未捕获到安装提示时，入口保持无害，不调用空 prompt。
* PWA 已安装/standalone/iOS standalone 模式下继续隐藏安装入口，避免显示不适用的安装文案。
* 只做最小修复，不重构 PWA 注册或路由结构。

## Acceptance Criteria

* [ ] 未安装的普通浏览器环境中，侧边栏能看到安装入口。
* [ ] 有 `beforeinstallprompt` 事件时，入口可点击并调用原有安装流程。
* [ ] 没有安装提示事件时，入口不可误触发安装流程。
* [ ] standalone/已安装模式下不显示安装入口。
* [ ] `pnpm --filter @dayu/web typecheck` 通过。
* [ ] `pnpm --filter @dayu/web build` 通过。
* [ ] 浏览器中验证侧边栏安装入口可见性。

## Definition of Done

* 最小代码变更完成。
* TypeScript 类型检查和构建通过。
* 浏览器 smoke test 覆盖侧边栏入口显示。
* 不引入新依赖或无关重构。

## Technical Approach

把“是否显示安装入口”和“是否能触发原生安装 prompt”拆成两个状态：`showInstallAction` 只由 installed/standalone 状态决定；`installAvailable` 只表示是否已有 `beforeinstallprompt` 事件。`AppShell` 在 `showInstallAction` 为真时渲染菜单项，并在 `installAvailable` 为假时禁用按钮。

## Decision (ADR-lite)

**Context**: `beforeinstallprompt` 并不是所有浏览器/时机都会触发，把菜单渲染完全绑定到该事件会导致安装入口消失。  
**Decision**: 未安装环境中始终展示安装 action；可用性由 `installAvailable` 控制，点击处理仍由 `App.tsx` 的已有 prompt guard 兜底。  
**Consequences**: 用户能重新看到安装入口；没有 prompt 的浏览器会看到禁用/无害状态，而已安装模式仍不会显示安装入口。

## Out of Scope

* 不调整 manifest、service worker、vite-plugin-pwa 配置。
* 不新增跨浏览器自定义安装教程弹窗。
* 不改登录、路由或其它导航项。

## Technical Notes

* Relevant specs: `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/type-safety.md`, `.trellis/spec/guides/index.md`。
* Relevant historical notes: `.trellis/tasks/archive/2026-05/05-07-pwa/prd.md`, `.trellis/tasks/archive/2026-05/05-05-project-audit-non-breaking-fixes/research/pwa-config-audit.md`。
