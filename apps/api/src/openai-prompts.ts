import type { UserContent } from 'ai';

export type PromptContentPart = Exclude<UserContent, string>[number];

/**
 * 风格参考图分析的系统提示词。
 * 中文翻译：分析参考图像的风格。只返回紧凑 JSON：{"tags":["标签1","标签2","标签3","标签4"],"description":"简短中文风格总结"}。
 * 标签必须是 2-6 个简短中文标签。描述必须是一句 60 字以内的简短中文句子，涵盖场景、光照和色彩搭配。
 */
export const STYLE_REFERENCE_ANALYSIS_SYSTEM_PROMPT =
  'Analyze the style of the reference image. Return compact JSON only: {"tags":["tag1","tag2","tag3","tag4"],"description":"short Chinese style summary"}. Tags must be 2-6 short Chinese labels. Description must be one short Chinese sentence under 60 characters covering scene, lighting, and palette.';

/**
 * 任务摘要标题生成的系统提示词。
 * 中文翻译：为一项图像生成任务返回一个简短中文标题。只描述具体任务特征：用户需求、主体、视觉风格、场景、是否有源图，或是否有参考图。
 * 使用 6 到 14 个中文字符。不要使用 Markdown、标点、引号或解释。
 */
export const TASK_SUMMARY_SYSTEM_PROMPT = [
  'Return one short Chinese title for an image generation task.',
  'Describe concrete task characteristics only: user request, subject, visual style, scene, source presence, or reference presence.',
  'Use 6 to 14 Chinese characters.',
  'No markdown, punctuation, quotes, or explanation.',
].join(' ');

/**
 * 图像生成提示词规划器的系统提示词。
 * 中文翻译：你是图像创作工作室的提示词规划器。给定带角色标签的上传图像和可选用户需求，推断期望的最终图像，并返回一个可直接用于生产的图像生成提示词。
 * 用户自定义需求具有最高优先级。如果它们与从图像推导出的指导冲突，优先遵循用户需求。不要提到你正在分析图像。只返回最终提示词，不要使用 Markdown 或解释。
 */
export const IMAGE_PROMPT_PLANNER_SYSTEM_PROMPT = [
  'You are the prompt planner for an image creation studio.',
  'Given role-labeled uploaded images and optional user requirements, infer the desired final image and return one production-ready image generation prompt.',
  'User custom requirements have the highest priority. If they conflict with image-derived guidance, follow the user requirements first.',
  'Do not mention that you are analyzing images. Return only the final prompt, no markdown or explanation.',
].join(' ');

type PromptContentPartFactory<TAsset> = (asset: TAsset) => PromptContentPart;

type PromptPlanningMessageInput<TAsset> = {
  userPrompt: string;
  sourceAssets: TAsset[];
  referenceAssets: TAsset[];
  size: string;
};

type TaskSummaryContextInput = {
  prompt: string;
  plannedPrompt?: string;
  personalReferenceCount: number;
  styleReferenceCount: number;
};

type FallbackPlannedImagePromptInput = {
  userPrompt: string;
  sourceAssets: unknown[];
  referenceAssets: unknown[];
  size: string;
};

/**
 * 构建风格参考图分析的用户消息。
 * 中文翻译：风格参考图数量：${assets.length}。只提取可见的风格语言：场景、光照、色彩搭配、构图、媒介、质感和氛围。
 * 不要识别人物，也不要从参考图中复制身份特征。
 */
export function buildStyleAnalysisMessage<TAsset>(assets: TAsset[], buildImageMessagePart: PromptContentPartFactory<TAsset>): UserContent {
  return [
    {
      type: 'text',
      text: [
        `Style reference image count: ${assets.length}`,
        'Extract only the visible style language: scene, lighting, color palette, composition, medium, texture, and atmosphere.',
        'Do not identify people or copy identity from the reference images.',
      ].join('\n'),
    },
    ...assets.map((asset) => buildImageMessagePart(asset)),
  ];
}

/**
 * 构建最终图像提示词规划的多模态用户消息，先给全局规则，再按源图和参考图附加图片内容。
 * 中文翻译：用户自定义需求（最高优先级）：${input.userPrompt || 'None'}。源图数量：${input.sourceAssets.length}。源图提供在相关时要保留的主体、身份、物体和特征信息。
 * 参考图数量：${input.referenceAssets.length}。参考图提供风格、场景、构图、媒介、光照、色彩搭配、情绪和视觉语言。请求输出尺寸：${input.size}。
 * 如果源图和参考图都存在，保留源图的主体/特征，同时重现参考图的风格/场景/视觉语言。绝不要复制参考图中的身份特征。
 * 每张源图说明：源图 N：从这张图中提取并按需保留主体/特征。每张参考图说明：参考图 N：从这张图中提取风格、场景、构图、光照、色彩搭配、媒介、质感和情绪。
 */
export function buildPromptPlanningMessage<TAsset>(
  input: PromptPlanningMessageInput<TAsset>,
  buildImageMessagePart: PromptContentPartFactory<TAsset>,
): UserContent {
  return [
    {
      type: 'text',
      text: [
        `User custom requirements (highest priority): ${input.userPrompt || 'None'}`,
        `Source image count: ${input.sourceAssets.length}. Source images provide subject, identity, object, and feature information to preserve when relevant.`,
        `Reference image count: ${input.referenceAssets.length}. Reference images provide style, scene, composition, medium, lighting, palette, mood, and visual language.`,
        `Requested output size: ${input.size}.`,
        'If source and reference images are both present, preserve the source subject/features while recreating the reference style/scene/visual language. Never copy identity from reference images.',
      ].join('\n'),
    },
    ...input.sourceAssets.flatMap((asset, index) => [
      {
        type: 'text' as const,
        text: `Source image ${index + 1}: extract and preserve the subject/features from this image as applicable.`,
      },
      buildImageMessagePart(asset),
    ]),
    ...input.referenceAssets.flatMap((asset, index) => [
      {
        type: 'text' as const,
        text: `Reference image ${index + 1}: extract style, scene, composition, lighting, palette, medium, texture, and mood from this image.`,
      },
      buildImageMessagePart(asset),
    ]),
  ];
}

/**
 * 构建任务标题摘要模型看到的上下文。
 * 中文翻译：用户需求：${input.prompt || '未填写'}。
 * 若存在规划后的提示词，则添加：最终图像提示词：${input.plannedPrompt}。
 * 若源图数量大于 0，则添加：源图：${input.personalReferenceCount}。
 * 若参考图数量大于 0，则添加：参考图：${input.styleReferenceCount}。
 * 标题重点：优先总结最终图像提示词，然后在有用时总结用户需求、主体、视觉风格、场景和图像参考组合关系。
 */
export function buildTaskSummaryContext(input: TaskSummaryContextInput) {
  const lines = [`User requirements: ${input.prompt || '未填写'}`];
  if (input.plannedPrompt) {
    lines.push(`Final image prompt: ${input.plannedPrompt}`);
  }
  if (input.personalReferenceCount > 0) {
    lines.push(`Source images: ${input.personalReferenceCount}`);
  }
  if (input.styleReferenceCount > 0) {
    lines.push(`Reference images: ${input.styleReferenceCount}`);
  }
  lines.push('Title focus: summarize the final image prompt first, then user request, subject, visual style, scene, and image-reference composition when useful.');
  return lines.join('\n');
}

/**
 * 构建规划模型不可用时的兜底最终图像提示词。
 * 中文翻译：创建一张精修图像。生成一张精致、连贯、高质量的最终图像，具有强构图、清晰主体、有意设计的光照和雅致的色彩设计。
 * 如有源图：使用上传的源图，在相关处保留主要主体、身份、物体特征、形状语言和可识别细节。
 * 如有一张参考图：使用上传的参考图重现其风格、场景、构图、光照、色彩搭配、质感、媒介和情绪。
 * 如有多张参考图：以参考图 1 作为主要场景/构图参考，并将后续参考图作为色彩搭配、质感、渲染媒介、情绪和细节的辅助线索。
 * 如有用户需求：最高优先级用户需求：${input.userPrompt}。如果任何指令冲突，先遵循用户需求，其次是源图保留，再其次是参考风格指导。
 * 始终添加：请求输出尺寸：${input.size}。
 */
export function buildFallbackPlannedImagePrompt(input: FallbackPlannedImagePromptInput) {
  const lines = [
    'Create one refined image',
    'Produce a polished, coherent, high-quality final image with strong composition, clear subject, intentional lighting, and tasteful color design.',
  ];

  if (input.sourceAssets.length > 0) {
    lines.push('Use the uploaded source image(s) to preserve the main subject, identity, object features, shape language, and recognizable details where relevant.');
  }
  if (input.referenceAssets.length === 1) {
    lines.push('Use the uploaded reference image to recreate its style, scene, composition, lighting, color palette, texture, medium, and mood.');
  } else if (input.referenceAssets.length > 1) {
    lines.push('Use reference image 1 as the main scene/composition reference, and use later reference images as secondary cues for palette, texture, rendering medium, mood, and details.');
  }
  if (input.userPrompt) {
    lines.push(`Highest priority user requirements: ${input.userPrompt}`);
    lines.push('If any instruction conflicts, follow the user requirements first, then source preservation, then reference style guidance.');
  }
  lines.push(`Requested output size: ${input.size}.`);
  return lines.join('\n\n');
}
