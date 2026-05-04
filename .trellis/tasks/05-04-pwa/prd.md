# 优化头像应用界面与 PWA 功能

## Goal

围绕头像生成 MVP 做一轮面向用户体验的优化：简化首页引导与上传交互，支持多参考图、历史参数回填、图片全屏预览、图库瀑布流与头像设置，并补齐 PWA 安装能力，让应用更像可安装的移动端产品。

## What I already know

* 顶部标签英文需要居中、正常大小写、不要强制大写。
* 首页去掉第一个提示卡片。
* 个人形象参考图与风格参考图都最多支持 3 张，展示区为正方形，布局规则为：1 张铺满、2 张竖图平分、3 张上方两个小正方形 + 下方一张长图。
* 已有图片时底部增加蒙层加号入口继续新增；多张可移除。
* 所有图片展示模块支持点击全屏。
* settings 应用信息改成面向用户的中文简介，退出按钮更突出。
* 历史记录状态增加浅色提示；生成任务创建时保存简短描述；再次生成进入首页并自动填充历史参数与参考图。
* 生成结果页图片展示比例按原图比例动态适配，去掉卡片标题《生成结果》。
* 侧边栏增加“添加到桌面”，应用改造为可安装 PWA；logo 在 apps/web/logo.png。
* 侧边栏空白处点击关闭；顶部标题栏头像点击到账户设置。
* 图库新增“设置为我的头像”，图库改为两列瀑布流，图片按原图比例展示；点击后全屏，底部展示操作按钮和生成时间；瀑布流只显示图片与已收藏粉色小花朵。
* 任务队列卡片展示任务总结；已完成/已失败不显示进度条。

## Assumptions

* “生成任务总结”可以优先使用大模型生成；mock 或模型不可用时用本地简短摘要兜底，避免阻塞创建任务。
* 多参考图需要后端存储多个 asset id，同时保留旧单图字段以兼容已有数据。
* “再次生成”不是立即创建新任务，而是回到首页预填历史参数，由用户确认后发起生成。
* “设置为我的头像”更新当前登录用户的 avatar_asset_id，并在重新获取用户信息后反映到顶部/设置页。
* PWA 采用无新增依赖的 manifest + service worker + beforeinstallprompt 安装入口。

## Requirements

* 首页移除 hero 提示卡，仅保留生成表单。
* 上传组件支持最多 3 张图片、指定布局、继续添加、移除、全屏查看。
* 创建任务 API 接受 personalReferenceAssetIds/styleReferenceAssetIds，同时兼容旧字段。
* 生成模型请求可携带多张个人参考与多张风格参考。
* 历史/队列接口返回 summary 与 reference assets；历史再次生成进入首页并预填。
* 设置页应用信息改为中文产品介绍，退出按钮视觉权重更高。
* 结果页图片按 width/height 比例显示完整图片，去掉内层标题。
* Gallery 改为两列瀑布流，只展示图片和收藏标识；全屏查看时展示操作按钮、生成时间，可设置头像。
* AppShell 支持安装入口、空白关闭、顶部头像跳转设置。
* PWA manifest/service worker/icon 接入。

## Acceptance Criteria

* [ ] 首页上传个人/风格参考图均可添加 1–3 张，达到 3 张后不再显示新增入口。
* [ ] 1/2/3 张参考图展示布局符合要求，多张时可移除。
* [ ] 参考图、生成结果、图库图片点击可全屏展示。
* [ ] 从历史点击“再次生成”回到首页，并预填提示词、标签、比例/分辨率/数量、参考图。
* [ ] 创建任务后历史与队列卡片展示简短总结。
* [ ] 结果图按原图比例完整展示，不裁切。
* [ ] 图库两列瀑布流按原图比例展示，收藏图显示粉色小花朵，详情全屏底部有操作按钮和时间。
* [ ] “设置为我的头像”更新用户头像并刷新顶部/设置页展示。
* [ ] 侧边栏存在“添加到桌面”入口，manifest 与 service worker 可被浏览器识别。
* [ ] lint/typecheck/build 通过；可启动前端验证主要 UI。

## Definition of Done

* Tests added/updated where appropriate.
* Lint / typecheck / build green.
* UI golden path verified in browser if dev server can start.
* No unrelated cleanup or broad refactor.

## Out of Scope

* 重新设计登录/OIDC 流程。
* 新增外部 PWA 依赖或推送通知/离线完整编辑能力。
* 批量选择/批量删除图库。

## Technical Notes

* Frontend touchpoints: apps/web/src/App.tsx, components/AppShell.tsx, components/UploadCard.tsx, components/Cards.tsx, pages/GeneratePage.tsx, HistoryPage.tsx, ResultPage.tsx, GalleryPage.tsx, QueuePage.tsx, SettingsPage.tsx, lib/api.ts, lib/types.ts, styles.css.
* Backend touchpoints: apps/api/src/index.ts schema, create/retry/history/queue/gallery/user endpoints, OpenAI prompt/image request building.
* PWA touchpoints: apps/web/index.html, apps/web/public or static assets, service worker registration in main.tsx.
