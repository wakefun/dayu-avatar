# 实现大宇头像 MVP

## Goal

基于 `need.md` 与 Stitch 项目 `18435155359975112615`，实现一个完整可运行、移动端优先的「大宇头像」Web MVP：用户通过「大宇统一登录」入口进入应用，上传个人形象参考图和风格参考图，填写/选择风格提示词，创建头像生成任务，查看生成中状态、生成结果、任务队列、历史记录，并把满意结果保存到图库。第一阶段以 mock 登录与 mock 头像生成为主，保证核心链路可演示、数据可持久化、UI 风格贴近 Stitch 设计稿。

## What I already know

- 项目是新仓库，目前没有应用源码，仅有 `need.md`、`AGENTS.md` 与 Trellis 配置。
- 产品定位是移动端 AI 头像生成应用，面向社交媒体创作者、个人品牌用户和普通头像用户。
- UI 以 Stitch 设计稿为准，核心风格是清透苹果系、艺术画廊感、清新高级、液态玻璃质感。
- 仅需要手机端适配，不需要专门兼容 PC；不使用底部 Tab；使用顶部菜单入口与侧边栏导航。
- 技术方向：monorepo、React 前端、Node.js 后端、SQLite、本地文件目录存图。
- OAuth 入口名称为「大宇统一登录」，MVP 可先 mock，不需要账号密码登录 UI 和注册表单。
- AI 生成后续通过 OpenAI 规范接口接入，`.env` 配置 base URL/API key，图片生成端点为 `/v1/images/generations`，模型 `gpt-image-2`，默认质量 `high`；MVP 先 mock 跑通流程。
- Stitch 项目可访问，项目标题为 `Dayu Avatar AI Art Gallery`，设备类型为 Mobile，已有登录、首页/生成、生成中、结果、图库、历史、侧边栏、任务队列、账户设置等屏幕。
- Stitch 设计主题名为 `Athereal Gallery`，字体为 Noto Serif + Manrope，中文上下文使用 PingFang SC；浅色高亮画廊风，Pearl White/Warm Ivory 基底，Mist Blue/Soft Lavender/Champagne Gold 等轻量点缀。

## Requirements

### Application structure

- 使用 monorepo 组织项目，至少包含：
  - `apps/web`：React + TypeScript + Vite 前端应用。
  - `apps/api`：Node.js + TypeScript 后端服务。
- 提供根级开发与验证脚本：安装依赖后可以启动前后端、构建、类型检查。
- 本地开发应能通过一个命令启动完整 MVP，前端请求后端 API。

### Authentication

- 实现登录页 `/login`。
- 登录页展示应用名称「大宇头像」与唯一主按钮「使用大宇统一登录」。
- 不实现账号密码输入与注册表单。
- MVP 使用 mock 登录创建本地会话；会话成功后进入头像生成页。
- 后端预留真实 OIDC 接入所需配置位：OIDC discovery URL、client id/secret、redirect URI 等，但真实 OAuth 不纳入本阶段必须完成范围。
- 支持获取当前用户与退出登录。

### Navigation and layout

- 实现移动端优先 App Shell。
- 使用顶部导航栏 + 侧边栏抽屉作为全局导航。
- 不使用底部 Tab。
- 全局导航至少包含：头像生成、我的图库、任务队列、历史记录、账户设置。
- 页面宽度应保持手机端观感；桌面浏览器中也以手机宽度画布展示即可。

### Avatar generation page

- 默认登录后进入头像生成页 `/`。
- 用户可以上传两类参考图，且 UI 上明确区分：
  - 个人形象参考图：用于保留个人特征。
  - 风格参考图：用于提供风格、摄影质感、插画风格或氛围。
- 用户可以输入头像风格描述。
- 页面提供可点击风格标签：清透写真、高级杂志、艺术肖像、法式插画、胶片质感、水彩插画、自然光、极简留白、温柔奶油色、轻奢氛围。
- 风格标签支持点击选中、再次点击取消，并同步填充/追加到提示词。
- 用户可以设置基础生成参数，MVP 至少包含模型、质量、尺寸/比例等展示或选择项；默认模型为 `gpt-image-2`、质量为 `high`。
- 点击生成后创建生成任务并跳转到生成中页面。

### Loading and task status

- 实现生成中页面 `/generate/loading/:taskId`。
- 展示明确文案：正在生成头像、当前任务仍在处理中。
- 展示步骤感反馈：分析个人形象、提取风格氛围、生成头像构图、高清细化中。
- 展示当前任务状态与进度。
- 提供进入任务队列的入口。
- MVP 使用 mock 任务进度；任务应能从排队/生成中自动变为已完成并产生模拟结果。

### Result page

- 实现生成结果页 `/generate/result/:taskId`。
- 展示生成头像结果图。
- 支持保存到图库、下载、重新生成、查看生成参数或详情。
- 保存到图库后图库页能看到该作品。
- 重新生成应基于原任务参数创建新任务。

### Gallery

- 实现我的图库页 `/gallery`。
- 图库只展示用户主动保存的最终头像作品，不等同于历史记录。
- 图库项支持查看、收藏/取消收藏、下载、删除、查看详情。
- 空状态引导用户去生成第一个头像。

### Queue

- 实现任务队列页 `/queue`。
- 支持展示状态：排队中、生成中、已完成、已失败、已取消。
- 任务项展示状态、进度或结果入口。
- 失败任务支持重试。

### History

- 实现历史记录页 `/history`。
- 展示用户所有生成行为，包括成功、失败、取消、重复生成。
- 历史项展示生成时间、提示词摘要、使用的参考图类型、任务状态、生成参数、再次生成入口。
- 历史记录与图库的数据边界必须清晰：历史来自所有任务，图库来自用户保存的结果。

### Account settings

- 实现账户设置页 `/settings`。
- 展示当前用户信息、登录方式状态与退出登录。
- 可展示应用信息或基础偏好，但不加入非核心账号管理功能。

### Backend and persistence

- 使用 SQLite 持久化数据。
- 图片文件保存在本地目录，不使用对象存储。
- 至少保存：用户信息、OAuth/mock 登录信息、上传图片记录、生成任务记录、生成结果记录、图库记录、历史记录所需字段。
- 本地图片大致分为：个人形象参考图、风格参考图、AI/mock 生成头像结果、可选缩略图。
- 后端提供静态文件访问路径给前端展示和下载本地图片。

### API contracts

- 实现最小 REST API：
  - `GET /api/auth/me`
  - `POST /api/auth/mock-login`
  - `POST /api/auth/logout`
  - `POST /api/uploads`
  - `GET /api/uploads/:assetId`
  - `POST /api/generation-tasks`
  - `GET /api/generation-tasks/:taskId`
  - `GET /api/generation-tasks/:taskId/progress`
  - `GET /api/generation-tasks/:taskId/result`
  - `POST /api/generation-tasks/:taskId/retry`
  - `GET /api/queue`
  - `GET /api/history`
  - `GET /api/gallery-items`
  - `POST /api/gallery-items`
  - `PATCH /api/gallery-items/:itemId`
  - `DELETE /api/gallery-items/:itemId`
  - `GET /api/gallery-items/:itemId/download`
- API 返回结构保持简单一致：单资源 `{ "task": ... }`、列表 `{ "items": [...] }`、错误 `{ "error": { "code", "message" } }`。

### Mock AI generation

- MVP 默认使用 mock generation service。
- Mock 流程必须跑通：上传参考图 → 创建生成任务 → 展示 Loading → 产生模拟生成结果 → 保存到图库 → 查看任务和历史记录。
- Mock 结果可以使用本地生成/复制的占位图片，但必须通过与真实生成结果一致的数据结构返回。
- 代码中保留清晰的服务边界，后续可在不改前端契约的前提下接入 OpenAI 兼容图片生成接口。

### Visual implementation

- 主要页面应尽量复刻 Stitch 的整体视觉与页面结构。
- 使用浅色高亮、玻璃拟态、柔和圆角、大留白、艺术画廊式卡片。
- 核心设计 token 参考 Stitch：
  - 基础背景：`#fcf8f8` / `#f9f7f2` 一类暖白。
  - 文字：深炭色，不使用纯黑作为主视觉。
  - 字体：标题优先 Noto Serif，正文/控件 Manrope；中文环境回退 PingFang SC。
  - 卡片：大圆角、细边框、轻阴影、半透明玻璃感。
  - 主按钮：胶囊形。
- 手机端触控目标应保持可点击，固定/粘性区域考虑安全区。

## Acceptance Criteria

- [ ] `pnpm install` 后可安装项目依赖。
- [ ] 可通过根级脚本启动前端与后端开发服务。
- [ ] 首次打开应用会进入登录页，点击「使用大宇统一登录」后进入头像生成页。
- [ ] 头像生成页可分别上传个人形象参考图和风格参考图。
- [ ] 风格标签可选中/取消，并同步影响提示词输入。
- [ ] 点击生成会创建任务、进入生成中页面，并看到 mock 进度步骤。
- [ ] Mock 任务完成后可查看生成结果页。
- [ ] 结果页可保存到图库、下载、重新生成、查看参数详情。
- [ ] 图库页只展示已保存作品，并支持收藏、删除、下载、查看详情或清晰入口。
- [ ] 任务队列页展示 queued/processing/completed/failed/canceled 状态，并提供失败重试入口。
- [ ] 历史记录页展示所有任务及提示词摘要、参考图类型、状态、参数、再次生成入口。
- [ ] 账户设置页展示当前 mock 用户并支持退出登录。
- [ ] SQLite 中持久化用户、会话/账号、文件资产、生成任务、生成结果、图库记录。
- [ ] 上传图片和生成结果保存到本地目录，并能通过后端静态路径访问。
- [ ] 页面在手机宽度下视觉完整，不出现必须依赖桌面布局的交互。
- [ ] 项目通过类型检查和构建检查。

## Definition of Done

- MVP 核心用户链路可在浏览器中实际操作：登录 → 上传 → 生成 → loading → 结果 → 保存图库 → 队列/历史查看。
- 前后端 API 契约一致，关键状态在刷新后仍由 SQLite 恢复。
- 本地文件上传与静态访问可用。
- Mock generation 与未来 OpenAI 兼容 generation 有明确服务边界。
- UI 贴近 Stitch 的移动端艺术画廊/液态玻璃风格。
- 类型检查、构建检查通过；如 lint/test 脚本存在也需通过。

## Technical Approach

- 使用 `pnpm` workspaces 管理 monorepo，初始不引入 Nx/Turborepo。
- 前端使用 React + TypeScript + Vite + React Router，移动端 SPA。
- 后端使用 Express + TypeScript + `tsx` 开发运行。
- SQLite 使用 `better-sqlite3`，以小型 repository/service 模块和 SQL 初始化脚本实现。
- 上传使用 `multer` route-scoped disk storage。
- 会话使用 cookie/session 语义；MVP 可用 mock session，保留 OIDC 配置入口。
- 图片生成使用 `generationService` 边界，默认 `mock` 模式，后续可切换 OpenAI-compatible 模式。
- 前端状态以服务端数据为准，使用轻量 fetch hooks；不在 MVP 引入复杂全局状态库。
- 移动端导航使用 React Router layout route + `AppShell` + `TopBar` + `SideDrawer`。

## Decision (ADR-lite)

**Context**: 项目是新仓库，目标是尽快完成可演示 MVP，同时保留真实 OAuth 与真实 AI 生成的后续接入空间。

**Decision**: 采用低复杂度 full-stack monorepo：pnpm workspaces、React/Vite、Express、better-sqlite3、multer、mock-first auth 和 mock-first generation。先实现完整业务闭环，不在第一阶段引入后台管理、会员、审核、订阅、真实 OpenAI 调用或完整 OIDC 授权码流程。

**Consequences**: 该方案能最快交付可操作 demo，依赖少、调试简单；代价是需要在后续真实 OAuth/OpenAI 阶段补齐 provider 验证、错误重试、异步任务队列和安全加固。

## Out of Scope

- 真实 OAuth 授权码登录完整接入。
- 真实 OpenAI 图片生成调用。
- 图片内容审核。
- 订阅、会员、支付、额度系统。
- 后台管理系统。
- PC/桌面专门适配。
- 对象存储、CDN、多实例部署。
- 复杂任务队列 worker 或分布式调度。
- 多结果批量生成与复杂图片编辑能力。

## Research References

- [`research/fullstack-stack.md`](research/fullstack-stack.md) — 推荐 pnpm workspaces + React/Vite + Express + better-sqlite3 + multer + mock-first auth/generation 的低摩擦 MVP 栈。
- [`research/api-data-contracts.md`](research/api-data-contracts.md) — 定义最小 REST API、SQLite 表映射、任务/图库/历史的数据边界。
- [`research/stitch-ui-implementation.md`](research/stitch-ui-implementation.md) — 将 Stitch 屏幕映射为 React 路由、组件、移动端导航与 UI primitive。

## Technical Notes

- Trellis 当前任务目录：`.trellis/tasks/05-02-dayu-avatar-mvp/`。
- 当前仓库没有 app code，应用脚手架需要从零创建。
- 可用 spec 层：`.trellis/spec/backend/*`、`.trellis/spec/frontend/*`、`.trellis/spec/guides/*`；当前多为占位指南，但仍应传给实现/检查代理以便后续一致性。
- Stitch 项目元数据确认：`Dayu Avatar AI Art Gallery`，Mobile，`Athereal Gallery` 主题。
- Stitch 已知屏幕：登录、首页/头像生成、生成中、生成结果、我的图库、历史记录、侧边栏、任务队列、账户设置。
- OIDC discovery URL 在研究环境下未得到标准 discovery JSON，MVP 因此按 mock-first 处理。
