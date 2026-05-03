# Component Guidelines

> How components are built in this project.

---

## Scenario: Mobile art-gallery UI components

### 1. Scope / Trigger

- Trigger: React UI components for the mobile-first Dayu Avatar app.
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
<PageSection eyebrow="创作" title="头像生成" description="...">
  {children}
</PageSection>
```

- Upload card categories:
  - `personal_reference`
  - `style_reference`

- Generation page style suggestions:

```tsx
<ChipGroup tags={styleTags} onSelect={insertPromptSnippet} />
```

- Stitch homepage setting controls:
  - `图片比例`: `1:1`, `3:4`, `9:16`
  - `图片分辨率`: `1K`, `2K`, `4K`
  - `生成数量`: `1`, `2`, `4`, `8` (default `1`)

### 3. Contracts

- Global navigation uses a top app bar and side drawer.
- Do not add a bottom tab bar.
- Generation/home page no longer uses a separate redundant intro hero card; the primary content starts with the upload and generation sections.
- Reference upload cards must support 1-3 images in a fixed square container.
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
- Topbar avatar opens settings and should render the actual user avatar image when available.
- Settings page must show the current session auth mode and handle provider logout redirects when returned by the API.

### 4. Validation & Error Matrix

- Style chip click toggles selected state -> change to one-shot snippet insertion with no active style.
- Resolution or quantity preference is not fully supported by backend -> keep visual control but add helper copy that states the current MVP output behavior.
- Action inside a card would also trigger parent navigation -> split into separate `<button>` / `<a>` elements.
- Drawer is open -> provide an overlay/close path and real navigation links.
- Upload control -> use image-specific accept behavior and show selected file state.
- Destructive gallery delete -> keep it an explicit button action.
- History regenerate should preserve prompt/style/reference/generation settings in navigation state; missing fields break home-page prefill.
- Fullscreen preview footer actions must stay touch-reachable and cannot depend on hover-only controls.
- Result image styling must use real image dimensions when available; hard-coded aspect ratio reintroduces cropping.
- Gallery masonry cards should not add captions or inline action rows back into the grid.

### 5. Good/Base/Bad Cases

- Good: `ChipGroup` renders style suggestions as plain buttons and calls `onSelect(tag)` to append a prompt snippet without active state.
- Good: `UploadCard` owns the square 1/2/3-image layout, add-more overlay, remove buttons, and fullscreen-preview callbacks for both personal and style references.
- Good: `HistoryCard` exposes a single bottom “再次生成” action while passing prefill-ready task data back to the home page.
- Good: `GalleryCard` is just an image button plus optional favorite flower marker; fullscreen actions live in the shared lightbox footer.
- Base: `ArtworkCard` renders image, metadata, and action buttons without hidden hover-only controls.
- Bad: make the entire visual card clickable and nest retry/delete controls inside it.
- Bad: render style suggestions as persistent selected filters when the product behavior is insert-only.
- Bad: reintroduce a separate “选择图片” button below the square upload area once the overlay add affordance exists.

### 6. Tests Required

- Browser smoke test should verify login, drawer navigation, generation controls, upload controls, style suggestion insertion, queue/history/gallery/settings pages, and save-to-gallery flow.
- Lint/typecheck/build must pass after component changes.
- For future automated UI tests, assert buttons are reachable by text and do not cause double navigation/action.
- For style suggestions, assert repeated clicks do not create a persistent selected visual state and do not duplicate the exact same snippet.
- Add UI assertions for 1/2/3-image reference layouts, remove actions, lightbox open/close, history regenerate prefill navigation, queue completed/failed cards hiding progress bars, result image using native aspect ratio, and gallery masonry cards remaining image-only.

### 7. Wrong vs Correct

#### Wrong

```tsx
<button type="button" className="secondary-button">选择图片</button>
```

#### Correct

```tsx
<div className={`reference-grid count-${Math.max(values.length, 1)}`}>
  {values.length > 0 && canAdd ? <label className="reference-add-overlay">…</label> : null}
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

- Use global CSS classes in `src/styles.css` for this MVP.
- Keep phone-width layout and safe mobile spacing as the default.
- Use CSS variables/design tokens for colors, radii, shadows, and spacing.

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
