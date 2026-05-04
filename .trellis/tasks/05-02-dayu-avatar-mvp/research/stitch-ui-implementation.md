# Research: stitch-ui-implementation

- **Query**: Translate the available Stitch project (18435155359975112615) into an implementable React MVP for the Dayu Avatar mobile-first web app.
- **Scope**: mixed
- **Date**: 2026-05-02

## Findings

### Files Found

| File Path | Description |
|---|---|
| `need.md` | Primary product brief covering UI direction, screen list, login flow, generation flow, queue, gallery, history, and MVP scope. |
| `.trellis/tasks/05-02-dayu-avatar-mvp/task.json` | Current Trellis task metadata showing this task is in planning state. |
| `.trellis/spec/frontend/index.md` | Frontend guideline index; currently a scaffold rather than project-specific conventions. |
| `.trellis/spec/frontend/component-guidelines.md` | Component guideline placeholder; no project-specific component rules documented yet. |
| `.trellis/spec/frontend/directory-structure.md` | Frontend structure placeholder; no concrete app directory conventions documented yet. |
| `AGENTS.md` | Trellis instruction wrapper pointing agents to `.trellis/` workflow and task artifacts. |

### Code Patterns

There is no existing React application source in the repository yet.

- Source directory search under the repo root found no `src/`, `app/`, `frontend/`, or `web/` directory for product code.
- The only discovered package manifest was `.opencode/package.json:1-4`, which is unrelated to the Dayu Avatar MVP runtime application.
- Product and UI constraints therefore currently come from `need.md`, not from implemented code patterns.

Relevant requirement anchors from `need.md`:

- Mobile-only and nav constraints: `need.md:34-42`
  - "移动端优先"
  - "仅需要适配手机端"
  - "不使用底部 Tab"
  - "使用顶部菜单入口和侧边栏导航"
- Required pages: `need.md:84-96`
- Avatar generation interactions: `need.md:102-121`
- Style tag interactions: `need.md:127-147`
- Loading and queue states: `need.md:151-185`
- Result actions: `need.md:188-200`
- Gallery and history separation: `need.md:204-238`
- MVP scope: `need.md:286-315`

### React MVP Translation

#### 1. Route model

Use a simple React Router app shell with one logged-out route and one authenticated layout route.

Recommended route tree:

| Route | Screen Title | Purpose |
|---|---|---|
| `/login` | 登录 | OAuth entry only; no password form. |
| `/` | 首页 / 头像生成 | Default authenticated landing page and main creation workflow. |
| `/generate/loading/:taskId` | 生成中 | Active generation progress with task status and queue shortcut. |
| `/generate/result/:taskId` | 生成结果 | Result preview, save, download, regenerate, details. |
| `/gallery` | 我的图库 | Saved final works only. |
| `/history` | 历史记录 | All generation attempts and parameters. |
| `/queue` | 任务队列 | Pending, running, completed, failed, canceled tasks. |
| `/settings` | 账户设置 | Account profile, OAuth state, logout, basic preferences. |

Implementation note:

- Put `/`, `/gallery`, `/history`, `/queue`, and `/settings` under one authenticated layout route so the top bar and side drawer stay persistent.
- Keep `/login`, `/generate/loading/:taskId`, and `/generate/result/:taskId` as dedicated screens, but loading and result can still reuse the same shell if the Stitch layout indicates the top nav remains visible.

External route pattern reference:

- React Router layout routes and nested routes support a persistent parent layout with child screens rendered through `Outlet`: https://reactrouter.com/start/declarative/routing

#### 2. Navigation model

The requirements are explicit that the MVP should not use a bottom tab bar.

Navigation structure:

- Top app bar on authenticated screens
  - Left: menu button to open side drawer
  - Center: current page title
  - Right: optional contextual action, e.g. settings shortcut or current task badge
- Side drawer for global navigation
  - 首页/头像生成
  - 我的图库
  - 历史记录
  - 任务队列
  - 账户设置
- In-flow navigation
  - Login success redirects to `/`
  - Generate CTA redirects to `/generate/loading/:taskId`
  - Generation completion redirects or links to `/generate/result/:taskId`
  - Queue items and history items deep-link to loading or result depending on task state
  - Result page actions can save to gallery without changing routes, then link to gallery/history

Drawer accessibility pattern:

- Prefer a semantic navigation list inside a modal drawer or sheet, not ARIA `menu` role for standard site navigation.
- If implemented as an overlay, treat it as a modal dialog with focus management and inert background.

External references:

- WAI disclosure navigation example warns against using `menu` role for ordinary navigation links: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/
- WAI modal dialog pattern for overlay behavior and focus return: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

#### 3. Page-to-component mapping

##### 登录 (`/login`)

Primary responsibilities from `need.md:61-79`:

- Show app brand: 「大宇头像」
- Single CTA: 「使用大宇统一登录」
- No username/password fields
- Convey trust and clarity

Suggested component breakdown:

- `AuthPage`
- `BrandMark`
- `HeroCard`
- `OAuthLoginButton`
- `TrustCopy`

##### 首页 / 头像生成 (`/`)

Primary responsibilities from `need.md:102-147`:

- Upload personal reference image
- Upload style reference image
- Enter prompt
- Tap style tags to append/remove text
- Set basic generation parameters
- Start generation

Suggested component breakdown:

- `AvatarGeneratePage`
- `AppShell`
- `TopBar`
- `SideDrawer`
- `SectionCard`
- `ReferenceUploadCard` for personal image
- `ReferenceUploadCard` for style image
- `PromptComposer`
- `StyleTagChips`
- `GenerationParameterForm`
- `PrimaryActionBar`

Data sections on page:

- Personal reference block
- Style reference block
- Prompt and tags block
- Parameter block
- Generate CTA block

##### 生成中 (`/generate/loading/:taskId`)

Primary responsibilities from `need.md:151-167`:

- Show active progress feedback
- Show task still processing
- Offer link to task queue
- Optionally show pseudo-steps

Suggested component breakdown:

- `GenerationLoadingPage`
- `ProgressHero`
- `TaskStepTimeline`
- `TaskStatusBadge`
- `QueueShortcutCard`
- `CancelTaskButton` if MVP includes cancel

##### 生成结果 (`/generate/result/:taskId`)

Primary responsibilities from `need.md:190-200`:

- View image
- Save to gallery
- Download
- Regenerate
- View parameters/details

Suggested component breakdown:

- `GenerationResultPage`
- `ResultImageStage`
- `ResultActionGroup`
- `TaskMetadataSheet`
- `SaveToGalleryButton`
- `DownloadButton`
- `RegenerateButton`

##### 我的图库 (`/gallery`)

Primary responsibilities from `need.md:204-218`:

- Show saved final works only
- Favorite/download/delete/view detail
- Empty state should lead back to creation

Suggested component breakdown:

- `GalleryPage`
- `ArtworkGrid`
- `ArtworkCard`
- `GalleryEmptyState`
- `ArtworkDetailSheet`

##### 历史记录 (`/history`)

Primary responsibilities from `need.md:222-238`:

- Show all generation attempts
- Include time, prompt summary, reference types, status, parameters
- Allow regenerate

Suggested component breakdown:

- `HistoryPage`
- `HistoryFilterBar` if MVP needs simple state filters
- `HistoryList`
- `HistoryListItem`
- `RegenerateInlineButton`
- `HistoryDetailSheet`

##### 任务队列 (`/queue`)

Primary responsibilities from `need.md:170-185`:

- Show queued, generating, completed, failed, canceled states
- Show status/progress/result entry
- Failed tasks support retry

Suggested component breakdown:

- `QueuePage`
- `TaskQueueList`
- `TaskQueueItem`
- `TaskProgressBar`
- `TaskStateBadge`
- `RetryTaskButton`

##### 账户设置 (`/settings`)

User-specified screen title only; no deeper product detail exists in `need.md` beyond account/OAuth storage in `need.md:248-256`.

Suggested MVP content:

- Current signed-in user summary
- OAuth connection display
- Logout action
- Optional app info/version block

Suggested component breakdown:

- `SettingsPage`
- `AccountCard`
- `OAuthStatusRow`
- `SettingsActionList`
- `LogoutButton`

##### 侧边栏

This is a shared component, not a standalone route.

Suggested component breakdown:

- `SideDrawer`
- `NavSection`
- `NavItem`
- `UserMiniProfile`
- `ActiveTaskSummary`

#### 4. Shared UI primitives implied by the Stitch-style MVP

Because the app is mobile-first and visually art-gallery oriented, the React MVP can stay small if it standardizes a few shared primitives.

Recommended shared primitives:

- `AppShell`
- `TopBar`
- `PageContainer`
- `SectionCard`
- `GlassCard`
- `PrimaryButton`
- `SecondaryButton`
- `IconButton`
- `Chip`
- `Badge`
- `ListRow`
- `BottomActionSheet`
- `ModalDrawer`
- `ImageTile`
- `EmptyState`
- `SkeletonBlock`

These primitives let the known screens map cleanly without introducing separate one-off layout systems.

#### 5. Design tokens to extract for implementation

The Stitch project itself was not directly accessible from the available tools in this session, so exact token values could not be exported. The implementation should therefore define token categories first and fill exact values after direct Stitch inspection.

Minimum token set for the React MVP:

##### Color tokens

| Token | Intended usage |
|---|---|
| `color.bg.base` | App background |
| `color.bg.elevated` | Cards, sheets, modal surfaces |
| `color.bg.overlay` | Drawer backdrop, modal scrim |
| `color.text.primary` | Primary text |
| `color.text.secondary` | Secondary text |
| `color.text.inverse` | Text on dark/accent surfaces |
| `color.border.soft` | Hairline borders |
| `color.border.strong` | Selected or active borders |
| `color.accent.primary` | Main brand/CTA color |
| `color.accent.secondary` | Supporting accent |
| `color.state.success` | Completed/saved states |
| `color.state.warning` | Queued/pending states |
| `color.state.error` | Failed/destructive states |
| `color.state.info` | In-progress state |

##### Typography tokens

| Token | Intended usage |
|---|---|
| `font.family.base` | Main UI font |
| `font.size.hero` | Login/feature headlines |
| `font.size.title` | Page titles |
| `font.size.body` | Default body copy |
| `font.size.caption` | Meta text |
| `font.weight.regular` | Standard text |
| `font.weight.medium` | Labels and chips |
| `font.weight.semibold` | CTA and page headings |
| `line.body` | Readable prompt/help text |
| `line.tight` | Large titles |

##### Spacing tokens

| Token | Intended usage |
|---|---|
| `space.1` to `space.8` | Consistent 4px or 8px scale |
| `space.page.x` | Horizontal page padding on mobile |
| `space.page.y` | Vertical page padding |
| `space.card` | Card internal padding |
| `space.section` | Vertical spacing between blocks |

##### Radius tokens

| Token | Intended usage |
|---|---|
| `radius.sm` | Chips, small badges |
| `radius.md` | Inputs and secondary buttons |
| `radius.lg` | Cards and image tiles |
| `radius.xl` | Hero surfaces and modal sheets |
| `radius.full` | Pills and circular buttons |

##### Elevation and blur tokens

| Token | Intended usage |
|---|---|
| `shadow.card` | Floating card depth |
| `shadow.sheet` | Drawer/sheet depth |
| `blur.glass` | Frosted card effect |
| `opacity.overlay` | Backdrop darkness |

##### Motion tokens

| Token | Intended usage |
|---|---|
| `motion.fast` | Press/hover/selection feedback |
| `motion.base` | Drawer and modal transitions |
| `motion.slow` | Page-level image reveal if used |
| `easing.standard` | Default transitions |
| `easing.emphasized` | Large panel entry/exit |

##### Size tokens

| Token | Intended usage |
|---|---|
| `size.touch.min` | Minimum touch target |
| `size.topbar.height` | Top navigation height |
| `size.drawer.width` | Mobile drawer width |
| `size.thumb.sm` | Small image thumbnail |
| `size.thumb.md` | Gallery/history thumbnail |
| `size.avatar.md` | User avatar summary |

Working assumptions from `need.md:25-34`:

- Visual direction: "清透苹果系", "艺术画廊感", "液态玻璃质感"
- Token families should therefore support light translucent surfaces, soft separators, restrained accents, and rounded surfaces.

#### 6. Mobile-only constraints for implementation

Direct requirement anchors: `need.md:34-42`.

Implementation constraints:

- Treat phone portrait as the primary breakpoint.
- Do not design a bottom tab bar.
- Keep global nav in a top app bar plus side drawer.
- Maintain single-column page flows for create, queue, history, and settings.
- Use vertically stacked cards and full-width primary actions.
- Keep core tap targets at least 44x44 CSS px when custom controls are authored.
- Protect top and bottom fixed UI with safe-area padding on notch devices.
- Gallery can still use 2-column cards on wider phones, but should degrade to 1-2 columns rather than desktop masonry.
- Avoid requiring hover-only interactions.
- Modal details should prefer bottom sheets or full-screen overlays on mobile.

External references:

- WCAG target guidance: https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced
- CSS `env()` safe area inset usage: https://developer.mozilla.org/en-US/docs/Web/CSS/env()

Recommended mobile shell CSS concerns:

- Use `padding-top: max(<base>, env(safe-area-inset-top))` on fixed header regions.
- Use `padding-bottom: max(<base>, env(safe-area-inset-bottom))` on sticky action bars and sheets.
- Keep page width constrained to a phone-friendly max width even on desktop browsers if no desktop adaptation is planned.

#### 7. MVP state model implied by screens

A minimal React MVP only needs a few UI state domains to support the Stitch screens:

| Domain | Used by |
|---|---|
| `auth` | 登录, 账户设置 |
| `draftGeneration` | 首页/头像生成 |
| `tasks` | 生成中, 任务队列, 历史记录 |
| `results` | 生成结果 |
| `gallery` | 我的图库 |
| `uiShell` | 顶部标题, side drawer open state, active nav item |

This aligns with the MVP note in `need.md:271-280`, where the initial generation flow can be mocked end-to-end.

#### 8. Screen relationship model

Primary user path from the documented requirements:

1. 登录
2. 首页/头像生成
3. 生成中
4. 生成结果
5. 保存到图库 or 返回继续生成
6. 随时可进入 任务队列 / 历史记录 / 我的图库 / 账户设置

Supporting deep-link behavior:

- Queue item with `processing` state opens loading screen.
- Queue item with `completed` state opens result screen.
- History item can open detail sheet or result screen.
- Gallery item opens artwork detail sheet or dedicated detail overlay.

#### 9. Related Specs

- `.trellis/spec/frontend/index.md` — frontend guidance index; currently placeholder-only.
- `.trellis/spec/frontend/component-guidelines.md` — component guidance scaffold; no project-specific rules yet.
- `.trellis/spec/frontend/directory-structure.md` — directory structure scaffold; no concrete app layout documented yet.

### External References

- [React Router routing and layout routes](https://reactrouter.com/start/declarative/routing) — supports a persistent authenticated shell with nested content screens.
- [React Router navigation primitives](https://reactrouter.com/start/framework/navigating) — relevant for `NavLink`, redirects after login, and programmatic navigation after generation.
- [WAI disclosure navigation example](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/) — relevant because the app uses standard navigation links in a top nav/drawer, not desktop-style ARIA menus.
- [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) — relevant for side drawer overlays and mobile sheets that should trap focus and return focus on close.
- [MDN `env()` CSS function](https://developer.mozilla.org/en-US/docs/Web/CSS/env()) — relevant for safe-area insets on mobile devices with notches/home indicators.
- [WCAG target size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced) — relevant for touch target sizing in a phone-first UI.

## Caveats / Not Found

- Stitch MCP was not available in the current toolset, so the actual Stitch project could not be inspected directly from this session.
- Public web search did not expose the private contents of Stitch project `18435155359975112615`; this research therefore relies on the known screen titles and the product brief in `need.md`.
- No Dayu Avatar React source code exists yet in the repository, so this document maps product/UI requirements into an implementable React MVP structure rather than documenting existing components.
- Exact design token values from Stitch were not retrievable here; token categories and intended usage are documented so values can be filled after direct Stitch export or manual inspection.
