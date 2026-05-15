import { db, getOwnedTask, getResultByTaskId, getTask } from './database';
import { defaultImageModel, defaultImageQuality, generationMode } from './config';
import { createBinaryGeneratedAsset, createSeedAsset, createWebpThumbnail, getThumbnailDimensions } from './assets';
import { parseSize } from './image-utils';
import { createGradientPng } from './mock-images';
import {
  buildImageGenerationPrompt,
  createOpenAiGenerationFailure,
  createTaskSummary,
  generateOpenAiImage,
  logOpenAiGenerationFailure,
  normalizeOpenAiGenerationFailure,
  type GeneratedImagePayload,
} from './openai-generation';
import { getTaskReferenceAssetIds, getTaskSummary, mapRecordItem } from './mappers';
import type { AssetRow, RecordRow, TaskRow } from './types';
import { createId, nowIso } from './utils';

const generationRuns = new Map<string, Promise<void>>();

export function normalizeAssetIdList(value: unknown, fallback: unknown, maxCount: number) {
  const rawValues = Array.isArray(value) ? value : typeof fallback === 'string' ? [fallback] : [];
  return rawValues.filter((assetId): assetId is string => typeof assetId === 'string' && assetId.trim().length > 0).slice(0, maxCount);
}

export function createGenerationTask(input: {
  userId: string;
  prompt: string;
  styleTags: string[];
  summary: string;
  personalReferenceAssetId: string;
  styleReferenceAssetId: string | null;
  personalReferenceAssetIds: string[];
  styleReferenceAssetIds: string[];
  model: string;
  quality: string;
  size: string;
  outputFormat: string;
  sourceTaskId: string | null;
}) {
  const id = createId('task');
  const now = nowIso();
  db.prepare(
    `INSERT INTO generation_tasks (
      id, user_id, status, prompt, style_tags_json, summary, personal_reference_asset_id, style_reference_asset_id,
      personal_reference_asset_ids_json, style_reference_asset_ids_json, model, quality, size, output_format,
      progress_percent, progress_step, error_code, error_message, source_task_id, created_at, updated_at, completed_at
    ) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 6, '排队中', NULL, NULL, ?, ?, ?, NULL)`
  ).run(
    id,
    input.userId,
    input.prompt,
    JSON.stringify(input.styleTags),
    input.summary,
    input.personalReferenceAssetId,
    input.styleReferenceAssetId,
    JSON.stringify(input.personalReferenceAssetIds),
    JSON.stringify(input.styleReferenceAssetIds),
    input.model,
    input.quality,
    input.size,
    input.outputFormat,
    input.sourceTaskId,
    now,
    now
  );

  return getTask(id)!;
}

export function ensureSeedTasks(userId: string) {
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM generation_tasks WHERE user_id = ?').get(userId) as { count: number };
  if (existingCount.count > 0) {
    return;
  }

  const personalAsset = createSeedAsset(userId, 'personal_reference', 'seed-personal.png', [236, 214, 210]);
  const styleAsset = createSeedAsset(userId, 'style_reference', 'seed-style.png', [206, 218, 240]);

  const completedPrompt = '清透写真 艺术肖像 自然光';
  const completed = createGenerationTask({
    userId,
    prompt: completedPrompt,
    styleTags: ['清透写真', '艺术肖像', '自然光'],
    summary: '清透自然光艺术肖像',
    personalReferenceAssetId: personalAsset.id,
    styleReferenceAssetId: styleAsset.id,
    personalReferenceAssetIds: [personalAsset.id],
    styleReferenceAssetIds: [styleAsset.id],
    model: defaultImageModel,
    quality: defaultImageQuality,
    size: '1024x1536',
    outputFormat: 'png',
    sourceTaskId: null,
  });

  const failedPrompt = '高级杂志 胶片质感';
  const failed = createGenerationTask({
    userId,
    prompt: failedPrompt,
    styleTags: ['高级杂志', '胶片质感'],
    summary: '高级杂志胶片质感',
    personalReferenceAssetId: personalAsset.id,
    styleReferenceAssetId: styleAsset.id,
    personalReferenceAssetIds: [personalAsset.id],
    styleReferenceAssetIds: [styleAsset.id],
    model: defaultImageModel,
    quality: defaultImageQuality,
    size: '1024x1536',
    outputFormat: 'png',
    sourceTaskId: null,
  });

  const canceledPrompt = '温柔奶油色 极简留白';
  const canceled = createGenerationTask({
    userId,
    prompt: canceledPrompt,
    styleTags: ['温柔奶油色', '极简留白'],
    summary: '温柔奶油色留白',
    personalReferenceAssetId: personalAsset.id,
    styleReferenceAssetId: styleAsset.id,
    personalReferenceAssetIds: [personalAsset.id],
    styleReferenceAssetIds: [styleAsset.id],
    model: defaultImageModel,
    quality: defaultImageQuality,
    size: '1024x1536',
    outputFormat: 'png',
    sourceTaskId: null,
  });

  const now = Date.now();
  db.prepare(
    `UPDATE generation_tasks SET status = 'completed', progress_percent = 100, progress_step = '生成完成',
     created_at = ?, updated_at = ?, completed_at = ? WHERE id = ?`
  ).run(new Date(now - 1000 * 60 * 30).toISOString(), new Date(now - 1000 * 60 * 29).toISOString(), new Date(now - 1000 * 60 * 29).toISOString(), completed.id);
  ensureMockGenerationResult(completed.id);

  db.prepare(
    `UPDATE generation_tasks SET status = 'failed', progress_percent = 42, progress_step = '提取风格氛围',
     error_code = 'GENERATION_FAILED', error_message = '当前任务未能顺利完成，请重新尝试。', created_at = ?, updated_at = ? WHERE id = ?`
  ).run(new Date(now - 1000 * 60 * 20).toISOString(), new Date(now - 1000 * 60 * 19).toISOString(), failed.id);

  const canceledCreatedAt = new Date(now - 1000 * 60 * 10).toISOString();
  const canceledUpdatedAt = new Date(now - 1000 * 60 * 9).toISOString();
  db.prepare(
    `UPDATE generation_tasks SET status = 'canceled', progress_percent = 15, progress_step = '任务已取消',
     created_at = ?, updated_at = ?, completed_at = ?, deleted_at = ? WHERE id = ?`
  ).run(canceledCreatedAt, canceledUpdatedAt, canceledUpdatedAt, canceledUpdatedAt, canceled.id);
}

export async function syncUserTasks(userId: string) {
  const activeTasks = db
    .prepare("SELECT id FROM generation_tasks WHERE user_id = ? AND status IN ('queued', 'processing') AND deleted_at IS NULL")
    .all(userId) as Array<{ id: string }>;

  for (const task of activeTasks) {
    await syncTask(task.id);
  }
}

export async function syncAndGetOwnedTask(userId: string, taskId: string) {
  const owned = getOwnedTask(userId, taskId);
  if (!owned) {
    return null;
  }

  await syncTask(taskId);
  return getOwnedTask(userId, taskId);
}

export async function syncTask(taskId: string) {
  const task = getTask(taskId);
  if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'canceled') {
    return task;
  }

  const elapsed = Date.now() - new Date(task.created_at).getTime();
  const checkpoints = [
    { max: 1600, status: 'queued' as const, percent: 8, step: '排队中' },
    { max: 3600, status: 'processing' as const, percent: 24, step: '理解创作需求' },
    { max: 5600, status: 'processing' as const, percent: 48, step: '规划生图提示词' },
    { max: 7600, status: 'processing' as const, percent: 72, step: '生成暗房作品' },
    { max: 9600, status: 'processing' as const, percent: 90, step: '高清细化中' },
  ];

  const checkpoint = checkpoints.find((item) => elapsed < item.max);
  if (checkpoint) {
    db.prepare('UPDATE generation_tasks SET status = ?, progress_percent = ?, progress_step = ?, updated_at = ? WHERE id = ?').run(
      checkpoint.status,
      checkpoint.percent,
      checkpoint.step,
      nowIso(),
      taskId
    );
    return getTask(taskId);
  }

  if (generationMode === 'mock') {
    finalizeMockTask(taskId);
    return getTask(taskId);
  }

  db.prepare('UPDATE generation_tasks SET status = ?, progress_percent = ?, progress_step = ?, updated_at = ? WHERE id = ?').run(
    'processing',
    96,
    '高清细化中',
    nowIso(),
    taskId
  );
  void ensureOpenAiGenerationStarted(taskId);
  return getTask(taskId);
}

export function finalizeMockTask(taskId: string) {
  try {
    ensureMockGenerationResult(taskId);
    db.prepare(
      "UPDATE generation_tasks SET status = 'completed', progress_percent = 100, progress_step = '生成完成', error_code = NULL, error_message = NULL, updated_at = ?, completed_at = ? WHERE id = ? AND deleted_at IS NULL"
    ).run(nowIso(), nowIso(), taskId);
  } catch {
    db.prepare(
      "UPDATE generation_tasks SET status = 'failed', progress_percent = 96, progress_step = '缩略图生成失败', error_code = 'GENERATION_FAILED', error_message = ?, updated_at = ? WHERE id = ?"
    ).run('缩略图生成失败，请检查 cwebp 是否已正确安装。', nowIso(), taskId);
  }
}

export function ensureMockGenerationResult(taskId: string) {
  const existing = getResultByTaskId(taskId);
  if (existing) {
    return existing;
  }

  const task = getTask(taskId);
  if (!task) {
    return null;
  }

  const [width, height] = parseSize(task.size);
  const imageAsset = createMockGeneratedAsset(task.user_id, task.id, 'generated_result', width, height, task.prompt, false);
  const thumbnailSize = getThumbnailDimensions(width, height);
  const thumbAsset = createBinaryGeneratedAsset({
    userId: task.user_id,
    taskId: task.id,
    category: 'generated_thumbnail',
    buffer: createWebpThumbnail(imageAsset.storage_path, width, height),
    mimeType: 'image/webp',
    extension: '.webp',
    width: thumbnailSize.width,
    height: thumbnailSize.height,
    fileNameSuffix: 'thumb',
  });
  const resultId = createId('res');

  db.prepare(
    'INSERT INTO generation_results (id, task_id, image_asset_id, thumbnail_asset_id, saved_to_gallery, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(resultId, taskId, imageAsset.id, thumbAsset.id, nowIso());

  return getResultByTaskId(taskId);
}

export function startGenerationRun(taskId: string) {
  if (generationMode === 'openai') {
    return ensureOpenAiGenerationStarted(taskId);
  }
  return Promise.resolve(syncTask(taskId)).then(() => undefined);
}

export function ensureOpenAiGenerationStarted(taskId: string) {
  const existing = generationRuns.get(taskId);
  if (existing) {
    return existing;
  }

  const run = runOpenAiGeneration(taskId).finally(() => {
    generationRuns.delete(taskId);
  });
  generationRuns.set(taskId, run);
  return run;
}

export async function runOpenAiGeneration(taskId: string) {
  const latestTask = getTask(taskId);
  if (!latestTask || latestTask.status === 'completed' || latestTask.status === 'failed' || latestTask.status === 'canceled') {
    return;
  }

  if (getResultByTaskId(taskId)) {
    db.prepare(
      "UPDATE generation_tasks SET status = 'completed', progress_percent = 100, progress_step = '生成完成', updated_at = ?, completed_at = ? WHERE id = ? AND deleted_at IS NULL"
    ).run(nowIso(), nowIso(), taskId);
    return;
  }

  try {
    const plannedPrompt = await buildImageGenerationPrompt(latestTask);
    await updateTaskSummaryFromPlannedPrompt(latestTask, plannedPrompt);
    if (!getTask(taskId)) {
      return;
    }
    const generated = await generateOpenAiImage(latestTask, plannedPrompt);
    if (!getTask(taskId)) {
      return;
    }
    await persistGeneratedResult(latestTask, generated);
    if (!getTask(taskId)) {
      return;
    }
    db.prepare(
      "UPDATE generation_tasks SET status = 'completed', progress_percent = 100, progress_step = '生成完成', error_code = NULL, error_message = NULL, updated_at = ?, completed_at = ? WHERE id = ? AND deleted_at IS NULL"
    ).run(nowIso(), nowIso(), taskId);
  } catch (error) {
    if (!getTask(taskId)) {
      return;
    }
    const failure = normalizeOpenAiGenerationFailure(error);
    logOpenAiGenerationFailure(latestTask, failure);
    db.prepare(
      "UPDATE generation_tasks SET status = 'failed', progress_percent = 96, progress_step = '高清细化中', error_code = 'GENERATION_FAILED', error_message = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL"
    ).run(failure.taskMessage, nowIso(), taskId);
  }
}

export async function persistGeneratedResult(task: TaskRow, image: GeneratedImagePayload) {
  const existing = getResultByTaskId(task.id);
  if (existing) {
    return existing;
  }

  const imageAsset = createBinaryGeneratedAsset({
    userId: task.user_id,
    taskId: task.id,
    category: 'generated_result',
    buffer: image.buffer,
    mimeType: image.mimeType,
    extension: image.extension,
    width: image.width,
    height: image.height,
    fileNameSuffix: 'result',
  });
  const thumbnailSize = getThumbnailDimensions(image.width, image.height);
  let thumbAsset: AssetRow;
  try {
    thumbAsset = createBinaryGeneratedAsset({
      userId: task.user_id,
      taskId: task.id,
      category: 'generated_thumbnail',
      buffer: createWebpThumbnail(imageAsset.storage_path, image.width, image.height),
      mimeType: 'image/webp',
      extension: '.webp',
      width: thumbnailSize.width,
      height: thumbnailSize.height,
      fileNameSuffix: 'thumb',
    });
  } catch (error) {
    throw createOpenAiGenerationFailure({
      status: null,
      providerCode: null,
      providerType: null,
      providerMessage: error instanceof Error ? error.message.slice(0, 200) : null,
      internalCode: 'CWEBP_THUMBNAIL_FAILED',
      taskMessage: '缩略图生成失败，请检查 cwebp 是否已正确安装。',
    });
  }
  const resultId = createId('res');

  db.prepare(
    'INSERT INTO generation_results (id, task_id, image_asset_id, thumbnail_asset_id, saved_to_gallery, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(resultId, task.id, imageAsset.id, thumbAsset.id, nowIso());

  return getResultByTaskId(task.id);
}

export async function getQueueItems(userId: string) {
  await syncUserTasks(userId);
  const rows = db
    .prepare("SELECT * FROM generation_tasks WHERE user_id = ? AND deleted_at IS NULL AND status != 'canceled' ORDER BY datetime(created_at) DESC")
    .all(userId) as TaskRow[];

  return rows.map((task) => ({
    id: task.id,
    status: task.status,
    summary: getTaskSummary(task),
    progress: {
      percent: task.progress_percent,
      step: task.progress_step,
    },
    createdAt: task.created_at,
    resultUrl: task.status === 'completed' ? `/generate/result/${task.id}` : null,
    errorMessage: task.error_message,
  }));
}

export async function getRecordPage(userId: string, limit: number, cursor: number) {
  await syncUserTasks(userId);
  const rows = db
    .prepare(
      `SELECT t.*, r.id as result_id, r.saved_to_gallery as result_saved_to_gallery, image_asset.public_url as image_url, thumb_asset.public_url as thumbnail_url,
              image_asset.width as image_width, image_asset.height as image_height, image_asset.content_hash as image_content_hash
       FROM generation_tasks t
       LEFT JOIN generation_results r ON r.task_id = t.id
       LEFT JOIN file_assets image_asset ON image_asset.id = r.image_asset_id AND image_asset.deleted_at IS NULL
       LEFT JOIN file_assets thumb_asset ON thumb_asset.id = r.thumbnail_asset_id AND thumb_asset.deleted_at IS NULL
       WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.status != 'canceled'
       ORDER BY datetime(t.created_at) DESC, t.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, limit + 1, cursor) as RecordRow[];
  const pageRows = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? cursor + limit : null;

  return {
    items: pageRows.map(mapRecordItem),
    pagination: {
      limit,
      nextCursor,
      hasMore: nextCursor !== null,
    },
  };
}

async function updateTaskSummaryFromPlannedPrompt(task: TaskRow, plannedPrompt: string) {
  try {
    const summary = await createTaskSummary({
      prompt: task.prompt,
      plannedPrompt,
      personalReferenceCount: getTaskReferenceAssetIds(task, 'personal').length,
      styleReferenceCount: getTaskReferenceAssetIds(task, 'style').length,
    });

    db.prepare('UPDATE generation_tasks SET summary = ?, updated_at = ? WHERE id = ?').run(summary, nowIso(), task.id);
  } catch {
    console.warn('[openai-generation] task summary update failed', { taskId: task.id });
  }
}

function createMockGeneratedAsset(
  userId: string,
  taskId: string,
  category: 'generated_result',
  width: number,
  height: number,
  seed: string,
  thumbnail: boolean
) {
  return createBinaryGeneratedAsset({
    userId,
    taskId,
    category,
    buffer: createGradientPng(width, height, seed, thumbnail),
    mimeType: 'image/png',
    extension: '.png',
    width,
    height,
    fileNameSuffix: thumbnail ? 'thumb' : 'result',
  });
}
