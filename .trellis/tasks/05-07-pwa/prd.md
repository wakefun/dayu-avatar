# 合并记录模块并修复图片与 PWA 问题

## Goal

修复生成与 PWA 安装态问题，同时把“任务队列”和“历史记录”合并为新的“我的记录”模块，降低用户在生成进度、历史结果、再次生成、下载原图之间来回切换的成本，并用缩略图降低记录页默认加载压力。

## What I already know

* 用户要求修复 `3:4` + `4k` 设置下的“图片参数错误”。
* 用户允许破坏性更新，可以合并/移除现有“任务队列”和“历史记录”模块。
* 新模块名称为“我的记录”。
* “我的记录”需要分页懒加载，默认加载 10 条，向下滑动自动加载更多。
* PWA 安装后打开时，菜单栏不应继续显示“当前浏览器暂不支持安装”。
* 当前 UI 太扁平，需要增加层次感、空间感和交互动画。
* 生成图片需要自动生成 WebP 缩略图，使用 `cwebp`，quality=88；页面默认展示预览图，下载按钮下载原图。

## Assumptions (temporary)

* “我的记录”按任务创建时间倒序展示所有任务状态：排队中、生成中、完成、失败、取消。
* 已完成任务卡片展示缩略图，点击预览默认看缩略/预览图，下载按钮获取原图。
* 旧 `/queue` 和 `/history` 路由直接移除，不做旧链接重定向。
* 记录分页采用后端 `limit=10` + `cursor` 或 `offset`，前端使用 IntersectionObserver 自动加载更多。
* `cwebp` 作为运行时系统命令使用，Docker runtime 镜像需要安装 webp 工具包；本地开发环境若没有 `cwebp` 会导致真实生成缩略图失败。

## Requirements

* 修复 `3:4` + `4k` 的图片尺寸参数，使前后端提交给 OpenAI 的尺寸合法且一致。
* 合并任务队列和历史记录为一个“我的记录”入口。
* “我的记录”显示实时任务进度、终态状态、失败重试、再次生成、结果预览、原图下载等现有能力。
* “我的记录”默认请求 10 条，并支持向下滚动自动加载更多。
* PWA 独立窗口/已安装模式下，菜单不显示“当前浏览器暂不支持安装”；只有浏览器环境且捕获到安装提示时显示“添加到桌面”。
* UI 增强层次感：卡片阴影、前后景空间、轻微 hover/active/进入动画，但不改变整体移动端窄屏布局。
* 真实生成结果持久化时同步生成 WebP 缩略图，quality 固定 88。
* 结果页、记录页、图库默认使用缩略图/预览图展示；下载原图使用原始生成资产。

## Acceptance Criteria

* [ ] 选择 `3:4` + `4K` 创建任务不再出现图片参数错误，并能进入生成流程。
* [ ] 导航菜单只保留“我的记录”，不再同时出现“任务队列”和“历史记录”。
* [ ] `/records` 首屏只加载 10 条，滚动到底部继续加载下一页。
* [ ] 活跃任务在“我的记录”中继续更新进度，终态任务可查看、重试或再次生成。
* [ ] PWA 安装后以 standalone 打开时，菜单不显示“当前浏览器暂不支持安装”。
* [ ] 新生成结果在 `generation_results.thumbnail_asset_id` 关联 WebP 缩略图，质量为 88。
* [ ] 页面图片展示优先使用缩略图；下载按钮下载原图。
* [ ] `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。
* [ ] 前端 UI 在浏览器中验证主要路径：创建任务、查看记录、加载更多、预览/下载、PWA 安装态显示。

## Definition of Done

* Tests added/updated where appropriate for utility/API behavior.
* Lint / typecheck / build green.
* Docker runtime includes `cwebp` dependency.
* No unrelated refactor or speculative feature.

## Technical Approach

* API：新增统一记录列表端点，返回队列 + 历史需要的统一记录结构，并提供分页字段。
* API：保留现有 task/result/gallery 能力，记录页只消费统一接口；旧 `/api/queue`、`/api/history` 作为 API 兼容端点保留但前端不再使用。
* API：真实生成和 mock 生成都会调用系统 `cwebp` 生成 WebP 缩略图，Docker runtime 从指定 libwebp 1.6.0 压缩包安装二进制。
* Web：新增/替换记录页，删除导航中的队列/历史双入口，并把创建多任务后的跳转改到“我的记录”；旧 `/queue` 和 `/history` 前端路由显示 404 式不可用页面，不重定向。
* Web：记录卡片合并 `QueueCard` 与 `HistoryCard` 能力，使用 IntersectionObserver 做无限滚动。
* Web：PWA 安装态使用 `display-mode: standalone` / iOS standalone 判断，已安装时隐藏安装按钮文案。
* UI：在 shared UI class 和相关卡片上做集中、轻量的层次与动效增强。

## Decision (ADR-lite)

**Context**: 队列和历史功能重复，用户允许破坏性更新；新增缩略图后记录页可以承载进度、历史、预览、下载。  
**Decision**: 使用一个“我的记录”模块作为任务进度和历史结果的统一入口，默认分页 10 条；旧 `/queue` 和 `/history` 前端路由直接移除，不做兼容重定向。  
**Consequences**: 前端路由和导航会破坏性变化；旧队列/历史概念不再作为独立模块暴露，但任务详情/结果页仍保留。

## Out of Scope

* 不新增复杂筛选、搜索、批量删除或云端同步。
* 不实现图片鉴权/签名 URL/CSP 变更。
* 不引入第三方前端动画库。
* 不改变账号/OIDC 登录流程。

## Technical Notes

* `apps/web/src/pages/GeneratePage.tsx`：尺寸选择与提交参数。
* `apps/api/src/index.ts`：生成任务、队列/历史/图库端点、结果持久化、尺寸规范化、下载端点。
* `apps/web/src/App.tsx`：路由和标题。
* `apps/web/src/components/AppShell.tsx`：导航和 PWA 安装按钮文案。
* `apps/web/src/pages/QueuePage.tsx`、`apps/web/src/pages/HistoryPage.tsx`：待合并模块。
* `apps/web/src/components/Cards.tsx`：记录/图库卡片默认图片源与交互。
* `apps/web/src/lib/api.ts`、`apps/web/src/lib/types.ts`：统一记录与分页类型。
* `Dockerfile`：runtime 阶段需要安装 `cwebp` 所在系统包。
