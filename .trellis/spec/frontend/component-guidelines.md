# Component Guidelines

> How components are built in this project.

---

## Scenario: Mobile art-gallery UI components

### 1. Scope / Trigger

- Trigger: React UI components for the mobile-first Dayu Darkroom app.
- UI should follow the Stitch direction: warm-white surfaces, glass/gallery cards, large radii, top navigation plus side drawer, no bottom tabs.

### 2. Signatures

- App shell:

```tsx
<AppShell title={title} user={user} drawerOpen={drawerOpen} onOpenDrawer={open} onCloseDrawer={close}>
  <Routes />
</AppShell>
```

- Shared page section:

```tsx
<PageSection title="大宇暗房" subtitle="...">
  {children}
</PageSection>
```

- Upload card categories:
  - `personal_reference`
  - `style_reference`

- Generation page upload and settings controls:

```tsx
<UploadCard title="原图" />
<UploadCard title="参考图" />
<SegmentedControl label="图片比例" options={ratioOptions} value={ratio} />
```

- Shared styling primitives:

```ts
import {
  cx,
  glassPanelClass,
  pageStackClass,
  softCardClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './ui';
```

- Darkroom homepage setting controls:
  - `图片比例`: `auto`, `1:1`, `3:4`, `4:3`, `9:16`, `16:9`, `21:9`, `9:21`
  - `auto` resolves from the first reference image only, snaps to the nearest listed explicit ratio, and falls back to `3:4` without reference dimensions
  - `图片分辨率`: `1K`, `2K`, `4K`
  - `生成数量`: `1`, `2`, `3`, `6` (default `1`)

### 3. Contracts

- Global navigation uses a top app bar and side drawer.
- Tailwind CSS is the primary styling mechanism for `apps/web`.
- `src/styles.css` should only hold Tailwind import plus minimal `@theme` / `@layer base` globals; do not rebuild the old business-class stylesheet there.
- Shared visual recipes belong in `src/components/ui.ts` as class constants/helpers and are consumed by components/pages.
- Components should compose shared primitives such as `AppShell`, `PageSection`, `UploadCard`, `Cards`, `ImageLightbox`, and `ui.ts` helpers rather than inventing page-local styling systems.
- Allow inline `style` only for true runtime values such as `backgroundImage`, progress width, and image `aspectRatio`.
- Do not add a bottom tab bar.
- Generation/home page no longer uses a separate redundant intro hero card; the primary content starts with the upload and generation sections.
- Uploaded reference images do not trigger upload-time style analysis in the MVP form; prompt planning happens only when generation starts.
- The generation custom text card is titled “自定义需求”; it is free-form user input, not a style-tag insertion surface.
- User-entered customization copy has highest generation priority, but the frontend should only pass it as `prompt`; priority wording is enforced by backend prompt planning.
- Reference upload layout rules are contract-level UI behavior: 1 image fills the square, 2 images split into two vertical tiles, 3 images render two top tiles plus one full-width bottom tile.
- When at least 1 reference image exists and count < 3, the card shows a bottom overlay add affordance rather than a separate extra button.
- Multiple uploaded references must support explicit remove actions.
- Any displayed image module (reference upload, history thumbnail, result image, gallery image) should open a fullscreen preview rather than introducing page-local detail routes.
- History “再次生成” should navigate back to `/` with editable prefilled draft state, not immediately create a backend retry task.
- Gallery cards are image-only masonry items in two columns; do not render per-card text metadata in the grid itself.
- Gallery cards show a pink flower marker only for favorited items.
- Gallery actions (favorite, download, delete, set-as-avatar, generated time) belong in the fullscreen preview footer, not inside the masonry card itself.
- Result-page image display should preserve original width/height with `object-fit: contain`; do not crop to a fixed portrait frame.
- Sidebar install action is a UI affordance that calls the browser install prompt when available and otherwise remains harmless.
- Sidebar install action renders only when the app is not already installed and `beforeinstallprompt` has provided an install prompt.
- Sidebar install action is not route navigation and must not reuse the active drawer navigation item style by default.
- Topbar avatar opens settings and should render the actual user avatar image when available.
- Settings page must show the current session auth mode and handle provider logout redirects when returned by the API.

### 4. Validation & Error Matrix

- Empty custom text and missing source/reference pair -> block submit with a validation message before creating a task.
- `auto` ratio with no first reference dimensions -> show and use `3:4`.
- Arbitrary first-reference dimensions -> snap to the nearest supported ratio before computing `generationParams.size`.
- Resolution or quantity preference is not fully supported by backend -> keep visual control but add helper copy that states the current MVP output behavior.
- Action inside a card would also trigger parent navigation -> split into separate `<button>` / `<a>` elements.
- Local delete plus live/SSE list refresh -> keep a page-local tombstone set and filter deleted IDs from every paginated or streamed merge.
- Drawer is closed -> overlay and drawer descendants must not remain tabbable.
- Drawer is open -> provide an overlay/close path and real navigation links.
- Upload control -> use image-specific accept behavior and show selected file state.
- Destructive gallery delete -> keep it an explicit button action.
- History regenerate should preserve prompt/style/reference/generation settings in navigation state; missing fields break home-page prefill.
- Fullscreen preview footer actions must stay touch-reachable and cannot depend on hover-only controls.
- Fullscreen preview dialog must have an accessible label, focus an explicit close control on open, and close on Escape.
- Result image styling must use real image dimensions when available; hard-coded aspect ratio reintroduces cropping.
- Gallery masonry cards should not add captions or inline action rows back into the grid.

### 5. Good/Base/Bad Cases

- Good: reference image uploads stay as visual inputs; no upload-time analysis panel is shown in the MVP form.
- Good: “自定义需求” remains a plain textarea; typed user requirements are sent as `prompt` without auto-inserting tag snippets.
- Good: `UploadCard` owns the square 1/2/3-image layout, add-more overlay, remove buttons, and fullscreen-preview callbacks for both personal and style references.
- Good: `HistoryCard` exposes a single bottom “再次生成” action while passing prefill-ready task data back to the home page.
- Good: `GalleryCard` is just an image button plus optional favorite flower marker; fullscreen actions live in the shared lightbox footer.
- Good: after `await api.deleteRecord(item.id)`, add `item.id` to a local tombstone set before merging any streamed records payloads.
- Base: `ArtworkCard` renders image, metadata, and action buttons without hidden hover-only controls.
- Bad: make the entire visual card clickable and nest retry/delete controls inside it.
- Bad: remove a deleted record from local state once but let the next SSE first-page payload merge it back into the list.
- Bad: reintroduce style suggestion chips or automatic snippet insertion on the custom text card.
- Bad: reintroduce a separate “选择图片” button below the square upload area once the overlay add affordance exists.
- Bad: show a disabled sidebar “添加到桌面” action when the install prompt is unavailable; hide the action instead.
- Bad: style the sidebar “添加到桌面” action like an active `NavLink`; it should look like a neutral action unless the user is interacting with it.

### 6. Tests Required

- Browser smoke test should verify login, drawer navigation, generation controls, upload controls, empty-input validation, text-only generation, queue/history/gallery/settings pages, and save-to-gallery flow.
- Mobile UI smoke checks should use a real mobile viewport or CDP device metrics and assert `document.documentElement.scrollWidth <= window.innerWidth` for login/shell pages; plain headless screenshots with only `--window-size` can show misleading desktop-style clipping.
- `pnpm --filter @dayu/web lint`, `pnpm --filter @dayu/web typecheck`, and `pnpm --filter @dayu/web build` must pass after styling changes.
- For future automated UI tests, assert buttons are reachable by text and do not cause double navigation/action.
- For live lists with destructive row actions, assert the row stays absent after the next SSE/streamed refresh payload.
- For auto ratio, assert the first reference image ratio snaps to the nearest supported ratio, source image dimensions are ignored, and missing reference dimensions fall back to `3:4`.
- Add UI assertions for 1/2/3-image reference layouts, remove actions, lightbox open/close, history regenerate prefill navigation, queue completed/failed cards hiding progress bars, result image using native aspect ratio, and gallery masonry cards remaining image-only.

### 7. Wrong vs Correct

#### Wrong

```tsx
<button type="button" className="secondary-button">选择图片</button>
```

#### Correct

```tsx
<button type="button" className={secondaryButtonClass}>选择图片</button>
```

#### Wrong

```tsx
<div className={`reference-grid count-${Math.max(values.length, 1)}`}>
  {values.length > 0 && canAdd ? <label className="reference-add-overlay">…</label> : null}
</div>
```

#### Correct

```tsx
<div
  className={cx(
    'relative grid aspect-square w-full overflow-hidden rounded-[22px]',
    count === 2 && 'grid-cols-2',
    count === 3 && 'grid-cols-2 grid-rows-2'
  )}
>
  {values.length > 0 && canAdd ? <label className="absolute inset-x-0 bottom-0">…</label> : null}
</div>
```

#### Wrong

```tsx
onRetry={(taskId) => api.retryTask(taskId)}
```

#### Correct

```tsx
navigate('/', {
  state: {
    prompt: item.prompt,
    styleTags: item.styleTags,
    personalReferenceAssets: item.personalReferenceAssets,
    styleReferenceAssets: item.styleReferenceAssets,
    generationParams: item.generationParams,
  },
});
```

#### Wrong

```tsx
<ChipGroup tags={styleTags} onSelect={insertPromptSnippet} />
```

#### Correct

```tsx
<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
{styleAnalysis ? <StyleSummary tags={styleAnalysis.tags} description={styleAnalysis.description} /> : null}
```

---

## Component Structure

- Components should be small functions with typed props.
- Keep route data loading in page components or hooks, not in purely visual primitives.
- Prefer shared primitives (`AppShell`, `PageSection`, cards, chips, upload cards) over duplicating glass-card markup.

---

## Props Conventions

- Define props with `type Props = { ... }` near the component.
- Use callback props named by user action (`onRetry`, `onDelete`, `onOpenDrawer`).
- Keep optional props explicit and render clear fallback states.

---

## Styling Patterns

- Use Tailwind CSS utilities in components/pages; do not introduce new global business classes in `src/styles.css`.
- Keep phone-width layout and safe mobile spacing as the default.
- Use `src/components/ui.ts` for shared class recipes such as glass panels, button variants, page stacks, card shells, field text, and `cx(...)` composition.
- Keep `src/styles.css` limited to Tailwind import, theme tokens, and base element styling.
- Use CSS variables or Tailwind theme tokens for shared colors and fonts, not ad-hoc repeated literals across many files.
- Inline styles are allowed only when the value is runtime-driven and cannot be expressed statically, such as avatar backgrounds, progress widths, and image aspect ratios.

---

## Accessibility

- Use real `<button>` elements for actions and real links/navigation controls for route changes.
- Avoid hover-only controls; all actions must work on touch.
- Keep the side drawer closeable via overlay and explicit close button.

---

## Common Mistakes

- Do not use bottom tabs; the product direction requires top menu + side drawer.
- Do not hide gallery empty-state recovery; include a visible CTA back to generation.
- Do not put multiple competing click handlers on the same card hierarchy.
