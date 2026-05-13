# Research: OpenAI image size constraints

- **Query**: Research OpenAI image generation API size/aspect-ratio constraints relevant to implementing custom aspect ratio support in this repo. Identify current supported size values for the likely image generation endpoints/models, whether arbitrary pixel dimensions are allowed, and recommended mapping behavior for user-entered ratios.
- **Scope**: mixed
- **Date**: 2026-05-14

## Findings

### Files Found

| File Path | Description |
|---|---|
| `apps/api/src/config.ts` | Runtime defaults set `OPENAI_IMAGE_MODEL` to `gpt-image-2` and `OPENAI_IMAGE_QUALITY` to `high` (lines 21-28). |
| `apps/api/src/routes.ts` | `POST /api/generation-tasks` accepts `generationParams.size`, normalizes it through `normalizeOpenAiSize`, then persists it on each task (lines 292-359). |
| `apps/api/src/image-utils.ts` | Backend size parser and OpenAI-size normalizer enforce max edge, min/max pixels, max 3:1 ratio, and 16-pixel multiples (lines 37-48, 139-198). |
| `apps/api/src/openai-generation.ts` | OpenAI generation uses AI SDK `generateImage`; text-only prompts call image generation, image-backed prompts call image edits, and both pass `size: normalizeOpenAiSize(task.size)` (lines 186-228). |
| `apps/web/src/pages/GeneratePage.tsx` | Frontend presets include `auto`, `1:1`, `3:4`, `4:3`, `9:16`, `16:9`, `21:9`, `9:21`; create task sends model `gpt-image-2` and `size: normalizeImageSize(...)` (lines 10-19, 175-186). |
| `apps/web/src/pages/GeneratePage.tsx` | Frontend converts ratio + resolution into dimensions and normalizes them with the same constraints as backend (lines 237-338). |
| `README.md` | Documents OpenAI-compatible generation defaults, including `OPENAI_IMAGE_MODEL` default `gpt-image-2` and use of image edits when references are uploaded (lines 81-100). |
| `.env.example` | Example OpenAI-compatible config sets `OPENAI_IMAGE_MODEL=gpt-image-2` (lines 15-24). |
| `.trellis/spec/backend/error-handling.md` | Spec says text-only OpenAI generation calls `/v1/images/generations`, image-backed generation calls `/v1/images/edits`, and default image model is `gpt-image-2` (lines 110-118, 137-138). |
| `.trellis/spec/frontend/component-guidelines.md` | Spec fixes current generation ratio controls and auto-ratio behavior: first reference image only, nearest listed explicit ratio, fallback `3:4` (lines 57-60, 94-97, 134-135). |
| `.trellis/spec/frontend/type-safety.md` | Spec requires frontend task creation to send `generationParams.size` and currently treats auto ratio as snapped to supported common ratios (lines 37-53, 80-84, 90-95). |

### Code Patterns

- Current likely model is `gpt-image-2`: `apps/api/src/config.ts:24` defaults `defaultImageModel` to `process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2'`, and `apps/web/src/pages/GeneratePage.tsx:181-185` hard-codes create-task params with `model: 'gpt-image-2'`, `quality: 'high'`, `size: normalizeImageSize(...)`, and `outputFormat: 'png'`.
- Both frontend and backend already normalize arbitrary `WIDTHxHEIGHT` strings rather than restricting to a short enum:
  - Backend: `apps/api/src/image-utils.ts:45-48` returns `${normalized.width}x${normalized.height}` from `normalizeImageDimensions(...parseSize(size))`.
  - Backend constraints: `apps/api/src/image-utils.ts:139-198` enforce `maxEdge = 3840`, `minPixels = 655_360`, `maxPixels = 8_294_400`, `maxAspectRatio = 3`, then round down to multiples of 16.
  - Frontend: `apps/web/src/pages/GeneratePage.tsx:237-242` computes ratio dimensions and returns normalized `"${normalized.width}x${normalized.height}"`; `apps/web/src/pages/GeneratePage.tsx:279-338` mirrors the same edge/pixel/aspect/multiple-of-16 logic.
- Text-only and image-backed requests use the same normalized size field at provider call time: `apps/api/src/openai-generation.ts:201-228` passes `size: normalizeOpenAiSize(task.size)` into `generateImage(...)`; image presence determines whether `prompt` is plain text or `{ text, images }` and whether provider options are typed as edit or generation options.
- Task creation normalizes before persistence: `apps/api/src/routes.ts:322-325` reads generation params and sets `const size = normalizeOpenAiSize(typeof generationParams.size === 'string' ? generationParams.size : '1024x1536');` before `createGenerationTask(...)` at lines 333-349.
- Existing preset ratios are enumerated in `apps/web/src/pages/GeneratePage.tsx:10-19`, with nearest-preset matching implemented by `findNearestExplicitRatio` at lines 369-373. Auto ratio resolves only from the first style/reference asset via `resolveAutoRatio(styleAssets[0])` (`apps/web/src/pages/GeneratePage.tsx:254-257`, `354-367`).

### External References

- [OpenAI Image generation guide](https://developers.openai.com/api/docs/guides/image-generation) — Current GPT Image docs say GPT Image models include `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`, and `gpt-image-1-mini`; image output supports size, quality, format, compression, and background options. For `gpt-image-2`, the docs state arbitrary `size` resolutions are accepted when constraints are met: max edge <= `3840px`, both edges multiples of `16px`, long:short ratio <= `3:1`, total pixels between `655,360` and `8,294,400`; outputs above `2560x1440` / `3,686,400` pixels are experimental. Listed popular sizes include `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`, `3840x2160`, `2160x3840`, and `auto`.
- [OpenAI Images API reference: create image](https://developers.openai.com/api/docs/api-reference/images/create) — Current API reference says `size` accepts arbitrary `WIDTHxHEIGHT` strings for `gpt-image-2` and `gpt-image-2-2026-04-21`, for example `1536x864`, with both dimensions divisible by 16 and aspect ratio between `1:3` and `3:1`. It also lists model-specific fixed sizes: GPT image standard sizes `1024x1024`, `1536x1024`, `1024x1536`; DALL·E 2 sizes `256x256`, `512x512`, `1024x1024`; DALL·E 3 sizes `1024x1024`, `1792x1024`, `1024x1792`; `auto` is supported for models that allow automatic sizing.
- [OpenAI Images API reference: create edit](https://developers.openai.com/api/docs/api-reference/images/createEdit) — Same size language applies to image edit requests: `gpt-image-2` allows arbitrary constrained `WIDTHxHEIGHT`; older GPT image models use the standard `1024x1024`, `1536x1024`, `1024x1536`, and `auto`; DALL·E fixed-size constraints differ.
- [OpenAI GPT Image Generation Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide) — Model comparison table says `gpt-image-2` supports any resolution satisfying constraints, while `gpt-image-1.5`, `gpt-image-1`, and `gpt-image-1-mini` support only `1024x1024`, `1024x1536`, `1536x1024`, and `auto`. The guide recommends `gpt-image-2` as the default for new builds and notes `2560x1440` as a recommended upper reliability boundary, with 4K-size outputs treated as experimental.
- [OpenAI DALL·E cookbook](https://developers.openai.com/cookbook/examples/dalle/image_generations_edits_and_variations_with_dall-e) — DALL·E 2 generation/edit/variation sizes are fixed to `256x256`, `512x512`, or `1024x1024`; DALL·E 3 generation sizes are fixed to `1024x1024`, `1792x1024`, or `1024x1792`.

### Related Specs

- `.trellis/spec/backend/error-handling.md` — OpenAI-compatible generation contract: env keys, default image model, text-only `/v1/images/generations`, image-backed `/v1/images/edits`, reference-first provider-bound images.
- `.trellis/spec/frontend/component-guidelines.md` — Current frontend ratio/resolution controls and auto-ratio behavior.
- `.trellis/spec/frontend/type-safety.md` — Frontend `generationParams` contract and current nearest-supported-ratio behavior.

### Current Supported Size Values by Likely Endpoint/Model

| Endpoint / model | Size support | Arbitrary pixel dimensions allowed? | Notes |
|---|---|---|---|
| `/v1/images/generations`, `gpt-image-2` / `gpt-image-2-2026-04-21` | Any `WIDTHxHEIGHT` string satisfying constraints; popular examples include `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`, `3840x2160`, `2160x3840`, plus `auto` | Yes, constrained | Width and height divisible by 16; aspect ratio within 1:3 to 3:1; max edge <= 3840; total pixels 655,360 to 8,294,400; > 2560x1440 pixels is experimental. |
| `/v1/images/edits`, `gpt-image-2` / `gpt-image-2-2026-04-21` | Same as generation per current API reference | Yes, constrained | Relevant because this repo uses edits when uploaded images are present. |
| `/v1/images/generations` and `/v1/images/edits`, `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` | No, based on docs | Older GPT image models are fixed to standard sizes. |
| `/v1/images/generations`, `dall-e-3` | `1024x1024`, `1792x1024`, `1024x1792` | No | OpenAI docs mark DALL·E models deprecated with support ending 2026-05-12. |
| `/v1/images/generations`, `/v1/images/edits`, `/v1/images/variations`, `dall-e-2` | `256x256`, `512x512`, `1024x1024` | No | DALL·E 2 supports edits/variations; fixed square sizes only. |

### Recommended Mapping Behavior for User-Entered Ratios

- For this repo's configured/default path (`gpt-image-2`), user-entered custom aspect ratios can map to an exact constrained `WIDTHxHEIGHT` string instead of nearest enum-only sizes, because OpenAI currently allows arbitrary constrained dimensions for `gpt-image-2` generation and edits.
- Size mapping should preserve the requested ratio as closely as possible while enforcing the documented constraints already mirrored in the repo: clamp long:short ratio to `3:1`, scale into `655,360..8,294,400` total pixels, cap max edge at `3840`, and round dimensions to multiples of 16.
- A resolution/base control can choose the intended long edge or pixel target before normalization. Current code uses base long-edge values of `1024`, `2048`, and `3840` for `1K`, `2K`, and `4K` (`apps/web/src/pages/GeneratePage.tsx:244-252`). OpenAI docs note outputs above `2560x1440` total pixels are experimental, so 4K mappings are valid for `gpt-image-2` only when they still satisfy all constraints and should be understood as experimental.
- If the selected/provider model is not `gpt-image-2`, arbitrary custom dimensions are not documented as supported. For legacy GPT image models, map custom ratios to the nearest of `1024x1024`, `1536x1024`, `1024x1536` (or `auto` if intentionally delegating sizing). For DALL·E 3, map to nearest of `1024x1024`, `1792x1024`, `1024x1792`; for DALL·E 2, only square fixed sizes are available.
- Existing auto-ratio behavior is already specified separately: use the first reference image only, snap it to the nearest listed explicit ratio, and fall back to `3:4` when reference dimensions are absent. Custom user-entered ratios do not need that nearest-preset snap for `gpt-image-2`; they only need validation/normalization to OpenAI's constrained dimension rules.

## Caveats / Not Found

- OpenAI docs surfaced through search contain a minor wording discrepancy: one guide highlight says max edge must be `<= 3840px`, while another cookbook highlight says less than `3840px`; the API reference says maximum supported resolution is `3840x2160`, and the main guide lists `3840x2160` / `2160x3840` as popular sizes. The repo currently uses `3840` as an inclusive max edge.
- The current repo default is `gpt-image-2`, but `OPENAI_IMAGE_MODEL` is configurable. If deployments point to OpenAI-compatible third-party providers or older OpenAI models, the `gpt-image-2` arbitrary-size contract may not hold.
- No project spec currently records custom user-entered ratio semantics; existing specs only cover preset ratios and auto-ratio snapping.
