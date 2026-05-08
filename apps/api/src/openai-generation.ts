import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createOpenAI, type OpenAIChatLanguageModelOptions, type OpenAIImageModelEditOptions, type OpenAIImageModelGenerationOptions } from '@ai-sdk/openai';
import { APICallError, generateImage, generateText, NoImageGeneratedError, type ModelMessage, type UserContent } from 'ai';
import { detectImageFile, normalizeOpenAiSize, normalizeOutputFormat, parseSize } from './image-utils';

export type ProviderAsset = {
  id: string;
  storage_path: string;
  mime_type: string;
};

export type ProviderTask = {
  id: string;
  prompt: string;
  model: string;
  quality: string;
  size: string;
  output_format: string;
};

export type TaskSummaryInput = {
  prompt: string;
  plannedPrompt?: string;
  personalReferenceCount: number;
  styleReferenceCount: number;
};

export type StyleReferenceAnalysis = {
  tags: string[];
  description: string;
};

export type GeneratedImagePayload = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
};

export type OpenAiGenerationFailure = {
  status: number | null;
  providerCode: string | null;
  providerType: string | null;
  providerMessage: string | null;
  internalCode: string;
  taskMessage: string;
};

type OpenAiGenerationOptions = {
  apiKey: string;
  baseUrl: string;
  promptModel: string;
  imageModel: string;
  imageQuality: string;
  requestTimeoutMs: number;
  dataRoot: string;
  cwebpBin: string;
  getAsset: (assetId: string) => ProviderAsset | undefined;
  getTaskReferenceAssetIds: (task: ProviderTask, type: 'personal' | 'style') => string[];
};

type PlannedImagePromptInput = {
  userPrompt: string;
  sourceAssets: ProviderAsset[];
  referenceAssets: ProviderAsset[];
  size: string;
};

let options: OpenAiGenerationOptions | null = null;

export function configureOpenAiGeneration(nextOptions: OpenAiGenerationOptions) {
  options = nextOptions;
}

export function normalizeOpenAiBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    url.pathname = normalizeOpenAiBasePath(url.pathname);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    const normalized = trimmed.replace(/\/+$/, '');
    return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
  }
}

export async function analyzeStyleReferenceAssets(assets: ProviderAsset[]): Promise<StyleReferenceAnalysis> {
  const fallback = buildFallbackStyleReferenceAnalysis(assets.length);
  if (!isOpenAiTextConfigured()) {
    return fallback;
  }

  try {
    const result = await generateOpenAiText({
      messages: [
        {
          role: 'system',
          content:
            'Analyze avatar style reference images. Return compact JSON only: {"tags":["tag1","tag2","tag3","tag4"],"description":"short Chinese style summary"}. Tags must be 2-6 short Chinese labels. Description must be one short Chinese sentence under 60 characters covering scene, lighting, and palette.',
        },
        {
          role: 'user',
          content: buildStyleAnalysisMessage(assets),
        },
      ],
      timeoutMs: Math.min(getOpenAiOptions().requestTimeoutMs, 30_000),
    });

    return parseStyleReferenceAnalysis(result) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function createTaskSummary(input: TaskSummaryInput) {
  const fallback = buildFallbackTaskSummary(input);
  if (!isOpenAiTextConfigured()) {
    return fallback;
  }

  try {
    const result = await generateOpenAiText({
      messages: [
        {
          role: 'system',
          content: [
            'Return one short Chinese title for an image generation task.',
            'Describe concrete task characteristics only: user request, subject, visual style, scene, source presence, or reference presence.',
            'Use 6 to 14 Chinese characters.',
            'No markdown, punctuation, quotes, or explanation.',
          ].join(' '),
        },
        {
          role: 'user',
          content: buildTaskSummaryContext(input),
        },
      ],
      timeoutMs: Math.min(getOpenAiOptions().requestTimeoutMs, 20_000),
    });

    return normalizeTaskSummary(result) || fallback;
  } catch {
    return fallback;
  }
}

export function buildFallbackTaskSummary(input: TaskSummaryInput) {
  const normalized = normalizeTaskSummary(input.prompt.trim());
  if (normalized) {
    return normalized;
  }

  if (input.personalReferenceCount > 0 && input.styleReferenceCount > 0) {
    return '原图参考创作';
  }
  if (input.styleReferenceCount > 0) {
    return '参考图创作';
  }
  if (input.personalReferenceCount > 0) {
    return '原图创作';
  }
  return '文字创意生成';
}

export function normalizeTaskSummary(value: string) {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 14);
}

export async function generateOpenAiImage(task: ProviderTask, plannedPrompt?: string): Promise<GeneratedImagePayload> {
  ensureOpenAiConfigured();
  const config = getOpenAiOptions();
  const [width, height] = parseSize(task.size);
  const imagePrompt = plannedPrompt ?? (await buildImageGenerationPrompt(task));
  const sourceAssets = getTaskAssets(task, 'personal');
  const referenceAssets = getTaskAssets(task, 'style');
  const images = [...referenceAssets, ...sourceAssets].map((asset) => createProviderRequestWebp(asset.storage_path));
  const outputFormat = normalizeOutputFormat(task.output_format);
  const imageProvider = createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  try {
    const result = await generateImage({
      model: imageProvider.image(task.model || config.imageModel),
      prompt:
        images.length > 0
          ? {
              text: imagePrompt,
              images,
            }
          : imagePrompt,
      n: 1,
      size: normalizeOpenAiSize(task.size),
      providerOptions:
        images.length > 0
          ? {
              openai: {
                quality: normalizeOpenAiImageQuality(task.quality || config.imageQuality),
                outputFormat,
              } satisfies OpenAIImageModelEditOptions,
            }
          : {
              openai: {
                quality: normalizeOpenAiImageQuality(task.quality || config.imageQuality),
                outputFormat,
              } satisfies OpenAIImageModelGenerationOptions,
            },
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(config.requestTimeoutMs),
    });

    const buffer = Buffer.from(result.image.uint8Array);
    if (buffer.byteLength === 0) {
      throw createOpenAiGenerationFailure({
        status: null,
        providerCode: null,
        providerType: null,
        providerMessage: 'Image response contained empty image data',
        internalCode: 'OPENAI_INVALID_RESPONSE',
        taskMessage: '生成服务返回了空的图片数据。',
      });
    }

    const file = detectImageFile(buffer);
    if (!file) {
      throw createOpenAiGenerationFailure({
        status: null,
        providerCode: null,
        providerType: null,
        providerMessage: 'Image response format could not be detected',
        internalCode: 'OPENAI_INVALID_RESPONSE',
        taskMessage: '生成服务返回了无法识别的图片格式。',
      });
    }

    return {
      buffer,
      mimeType: file.mimeType,
      extension: file.extension,
      width,
      height,
    };
  } catch (error) {
    if (isOpenAiGenerationFailureError(error)) {
      throw error;
    }
    throw createOpenAiGenerationFailure(normalizeAiSdkFailure(error));
  }
}

export async function buildImageGenerationPrompt(task: ProviderTask) {
  const sourceAssets = getTaskAssets(task, 'personal');
  const referenceAssets = getTaskAssets(task, 'style');
  const userPrompt = task.prompt.trim();

  if (sourceAssets.length === 0 && referenceAssets.length === 0) {
    return userPrompt;
  }

  return createPlannedImagePrompt({
    userPrompt,
    sourceAssets,
    referenceAssets,
    size: normalizeOpenAiSize(task.size),
  });
}

export async function createPlannedImagePrompt(input: PlannedImagePromptInput) {
  const fallback = buildFallbackPlannedImagePrompt(input);
  if (!isOpenAiTextConfigured()) {
    return fallback;
  }

  try {
    const result = await generateOpenAiText({
      messages: [
        {
          role: 'system',
          content: [
            'You are the prompt planner for an image creation studio.',
            'Given role-labeled uploaded images and optional user requirements, infer the desired final image and return one production-ready image generation prompt.',
            'User custom requirements have the highest priority. If they conflict with image-derived guidance, follow the user requirements first.',
            'Do not mention that you are analyzing images. Return only the final prompt, no markdown or explanation.',
          ].join(' '),
        },
        {
          role: 'user',
          content: buildPromptPlanningMessage(input),
        },
      ],
      providerOptions: {
        openai: {
          reasoningEffort: 'high',
          serviceTier: 'priority',
        } satisfies OpenAIChatLanguageModelOptions,
      },
      timeoutMs: Math.min(getOpenAiOptions().requestTimeoutMs, 60_000),
    });

    return normalizePlannedImagePrompt(result) || fallback;
  } catch {
    return fallback;
  }
}

export function createOpenAiGenerationFailure(failure: OpenAiGenerationFailure) {
  const error = new Error(failure.taskMessage) as Error & { details?: OpenAiGenerationFailure };
  error.details = failure;
  return error;
}

export function normalizeOpenAiGenerationFailure(error: unknown): OpenAiGenerationFailure {
  if (isOpenAiGenerationFailureError(error)) {
    return error.details;
  }

  return normalizeAiSdkFailure(error);
}

export function logOpenAiGenerationFailure(task: { id: string }, failure: OpenAiGenerationFailure) {
  console.warn('[openai-generation] task failed', {
    taskId: task.id,
    status: failure.status,
    providerCode: failure.providerCode,
    providerType: failure.providerType,
    providerMessage: failure.providerMessage ? sanitizeTaskErrorDetail(failure.providerMessage) : null,
    internalCode: failure.internalCode,
  });
}

function generateOpenAiText(input: { messages: ModelMessage[]; providerOptions?: Parameters<typeof generateText>[0]['providerOptions']; timeoutMs: number }) {
  const config = getOpenAiOptions();
  const provider = createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  return generateText({
    model: provider.chat(config.promptModel),
    messages: input.messages,
    providerOptions: input.providerOptions,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(input.timeoutMs),
  }).then((result) => result.text.trim());
}

function isOpenAiTextConfigured() {
  const config = getOpenAiOptions();
  return Boolean(config.apiKey && config.baseUrl);
}

function ensureOpenAiConfigured() {
  const config = getOpenAiOptions();
  if (!config.apiKey) {
    throw createOpenAiGenerationFailure({
      status: null,
      providerCode: null,
      providerType: null,
      providerMessage: null,
      internalCode: 'OPENAI_CONFIG_MISSING_API_KEY',
      taskMessage: '生成服务配置不完整，请检查 OPENAI_API_KEY。',
    });
  }

  if (!config.baseUrl) {
    throw createOpenAiGenerationFailure({
      status: null,
      providerCode: null,
      providerType: null,
      providerMessage: null,
      internalCode: 'OPENAI_CONFIG_MISSING_BASE_URL',
      taskMessage: '生成服务配置不完整，请检查 OPENAI_BASE_URL。',
    });
  }
}

function getOpenAiOptions() {
  if (!options) {
    throw new Error('openai_generation_not_configured');
  }
  return options;
}

function normalizeOpenAiBasePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '');
  if (!normalized || normalized === '/') {
    return '/v1';
  }
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

function getTaskAssets(task: ProviderTask, type: 'personal' | 'style') {
  const config = getOpenAiOptions();
  return config
    .getTaskReferenceAssetIds(task, type)
    .map((assetId) => config.getAsset(assetId))
    .filter((asset): asset is ProviderAsset => Boolean(asset));
}

function buildStyleAnalysisMessage(assets: ProviderAsset[]): UserContent {
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

function buildPromptPlanningMessage(input: PlannedImagePromptInput): UserContent {
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

function buildImageMessagePart(asset: ProviderAsset) {
  const config = getOpenAiOptions();
  return {
    type: 'file' as const,
    data: fs.readFileSync(path.join(config.dataRoot, asset.storage_path)),
    mediaType: asset.mime_type || 'application/octet-stream',
  };
}

function buildTaskSummaryContext(input: TaskSummaryInput) {
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

function parseStyleReferenceAnalysis(value: string): StyleReferenceAnalysis | null {
  const jsonText = extractJsonObjectText(value);
  if (!jsonText) {
    return null;
  }

  try {
    return normalizeStyleReferenceAnalysis(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

function normalizeStyleReferenceAnalysis(value: unknown): StyleReferenceAnalysis | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as Partial<StyleReferenceAnalysis>;
  const tags = Array.isArray(input.tags)
    ? input.tags
        .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        .map((tag) => tag.trim().slice(0, 12))
        .filter((tag, index, values) => values.indexOf(tag) === index)
        .slice(0, 6)
    : [];
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, 80) : '';

  if (tags.length === 0 || !description) {
    return null;
  }

  return {
    tags,
    description,
  };
}

function extractJsonObjectText(value: string) {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return '';
  }
  return value.slice(start, end + 1);
}

function buildFallbackStyleReferenceAnalysis(count: number): StyleReferenceAnalysis {
  return {
    tags: count > 1 ? ['主图场景', '参考风格', '光影配色'] : ['参考构图', '风格还原', '光影配色'],
    description: count > 1 ? '以主图场景为核心，融合参考图的光影、配色与质感。' : '提取参考图的场景、打光、配色与构图用于风格还原。',
  };
}

function buildFallbackPlannedImagePrompt(input: PlannedImagePromptInput) {
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

function normalizePlannedImagePrompt(value: string) {
  return value
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/g, '')
    .trim()
    .slice(0, 4000);
}

function createProviderRequestWebp(sourceStoragePath: string) {
  const config = getOpenAiOptions();
  try {
    return execFileSync(config.cwebpBin, ['-quiet', '-q', '91', path.join(config.dataRoot, sourceStoragePath), '-o', '-'], {
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
    throw createOpenAiGenerationFailure({
      status: null,
      providerCode: null,
      providerType: null,
      providerMessage: null,
      internalCode: 'CWEBP_PROVIDER_IMAGE_FAILED',
      taskMessage: '生成前图片压缩失败，请检查 cwebp 是否已正确安装。',
    });
  }
}

function normalizeOpenAiImageQuality(value: string): OpenAIImageModelEditOptions['quality'] {
  if (value === 'auto' || value === 'low' || value === 'medium' || value === 'high' || value === 'standard' || value === 'hd') {
    return value;
  }
  return 'high';
}

function normalizeAiSdkFailure(error: unknown): OpenAiGenerationFailure {
  if (APICallError.isInstance(error)) {
    const apiError = extractApiErrorData(error.data);
    const providerMessage = apiError.message ?? error.message ?? null;
    return {
      status: error.statusCode ?? null,
      providerCode: apiError.code,
      providerType: apiError.type,
      providerMessage,
      internalCode: inferOpenAiInternalCode(error.statusCode ?? 0, apiError.code, apiError.type),
      taskMessage: error.statusCode
        ? buildTaskFailureMessage(error.statusCode, apiError.code, apiError.type, providerMessage)
        : buildUnknownTaskFailureMessage(providerMessage),
    };
  }

  if (NoImageGeneratedError.isInstance(error)) {
    return {
      status: null,
      providerCode: null,
      providerType: null,
      providerMessage: error.message,
      internalCode: 'OPENAI_INVALID_RESPONSE',
      taskMessage: '生成服务返回了无法识别的图片结果。',
    };
  }

  const message = error instanceof Error ? truncateForLog(error.message, 200) : null;
  const networkFailure = isOpenAiNetworkFailure(message);

  return {
    status: null,
    providerCode: null,
    providerType: null,
    providerMessage: message,
    internalCode: networkFailure ? 'OPENAI_NETWORK_ERROR' : 'OPENAI_REQUEST_FAILED',
    taskMessage: networkFailure
      ? `生成服务网络连接失败，请检查 Base URL、网络或代理配置（${sanitizeTaskErrorDetail(message ?? 'network error')}）。`
      : '调用生成服务失败，请查看服务日志。',
  };
}

function isOpenAiGenerationFailureError(error: unknown): error is Error & { details: OpenAiGenerationFailure } {
  return error instanceof Error && 'details' in error && Boolean((error as Error & { details?: OpenAiGenerationFailure }).details);
}

function extractApiErrorData(value: unknown) {
  if (!value || typeof value !== 'object') {
    return { code: null, type: null, message: null };
  }

  const error = 'error' in value && value.error && typeof value.error === 'object' ? (value.error as Record<string, unknown>) : (value as Record<string, unknown>);
  return {
    code: typeof error.code === 'string' ? error.code : typeof error.code === 'number' ? String(error.code) : null,
    type: typeof error.type === 'string' ? error.type : null,
    message: typeof error.message === 'string' ? error.message : null,
  };
}

function inferOpenAiInternalCode(status: number, providerCode: string | null, providerType: string | null) {
  if (status === 400) {
    return 'OPENAI_BAD_REQUEST';
  }
  if (status === 401 || status === 403) {
    return 'OPENAI_AUTH_FAILED';
  }
  if (status === 404) {
    return 'OPENAI_MODEL_OR_ENDPOINT_NOT_FOUND';
  }
  if (status === 408 || status === 429) {
    return 'OPENAI_RATE_LIMITED';
  }
  if (status >= 500) {
    return 'OPENAI_PROVIDER_ERROR';
  }
  if (providerCode === 'model_not_found' || providerType === 'invalid_request_error') {
    return 'OPENAI_MODEL_REQUEST_ERROR';
  }
  return 'OPENAI_REQUEST_FAILED';
}

function buildTaskFailureMessage(status: number, providerCode: string | null, providerType: string | null, providerMessage: string | null) {
  const detail = sanitizeTaskErrorDetail(providerCode ?? providerType ?? providerMessage ?? `HTTP ${status}`);

  if (status === 400) {
    return `生成请求被服务拒绝，请检查模型或参数配置（${detail}）。`;
  }
  if (status === 401 || status === 403) {
    return `生成服务认证失败，请检查 API Key 或服务权限（${detail}）。`;
  }
  if (status === 404) {
    return `生成服务模型或接口不可用，请检查 Base URL 和模型配置（${detail}）。`;
  }
  if (status === 408 || status === 429) {
    return `生成服务当前繁忙或被限流，请稍后重试（${detail}）。`;
  }
  if (status >= 500) {
    return `生成服务暂时不可用，请稍后重试（${detail}）。`;
  }
  return `调用生成服务失败，请查看服务日志（${detail}）。`;
}

function buildUnknownTaskFailureMessage(message: string | null) {
  const networkFailure = isOpenAiNetworkFailure(message);
  if (networkFailure) {
    return `生成服务网络连接失败，请检查 Base URL、网络或代理配置（${sanitizeTaskErrorDetail(message ?? 'network error')}）。`;
  }
  return '调用生成服务失败，请查看服务日志。';
}

function sanitizeTaskErrorDetail(value: string) {
  return truncateForLog(stripSensitiveText(value).replace(/\s+/g, ' ').trim(), 80);
}

function truncateForLog(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function sanitizeLoggedUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return truncateForLog(value.split('?')[0] ?? value, 200);
  }
}

function stripSensitiveText(value: string) {
  return value
    .replace(/https?:\/\/[^\s]+/gi, (url) => sanitizeLoggedUrl(url))
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[a-z0-9._-]+/gi, '[redacted-api-key]')
    .replace(/api[_-]?key\s*[:=]\s*[^\s,;]+/gi, 'api_key=[redacted]');
}

function isOpenAiNetworkFailure(message: string | null) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('tls') ||
    normalized.includes('ssl') ||
    normalized.includes('econn') ||
    normalized.includes('enotfound') ||
    normalized.includes('eai_again')
  );
}
