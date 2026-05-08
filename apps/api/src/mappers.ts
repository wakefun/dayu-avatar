import session from 'express-session';
import { db, getAsset, getResultByTaskId, getSession } from './database';
import { buildFallbackTaskSummary, normalizeTaskSummary, type ProviderTask } from './openai-generation';
import type { AssetRow, AuthMode, GalleryRow, RecordRow, ResultRow, TaskRow, TaskStatus, UserRow } from './types';
import { getSessionExpiry } from './session-store';

export function mapUser(user: UserRow) {
  let avatarUrl: string | null = null;
  if (user.avatar_asset_id) {
    const avatar = getAsset(user.avatar_asset_id);
    avatarUrl = avatar ? avatar.public_url : null;
  }

  return {
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    avatarUrl,
  };
}

export function mapAsset(asset: AssetRow) {
  return {
    id: asset.id,
    category: asset.category,
    mimeType: asset.mime_type,
    width: asset.width,
    height: asset.height,
    fileName: asset.file_name,
    fileUrl: asset.public_url,
    createdAt: asset.created_at,
  };
}

export function mapTask(task: TaskRow, withResult = false) {
  const result = withResult ? getResultByTaskId(task.id) : null;
  return {
    id: task.id,
    status: task.status,
    prompt: task.prompt,
    promptSummary: getTaskSummary(task),
    styleTags: parseStoredStyleTags(task.style_tags_json),
    personalReferenceAssetId: task.personal_reference_asset_id,
    styleReferenceAssetId: task.style_reference_asset_id,
    personalReferenceAssetIds: getTaskReferenceAssetIds(task, 'personal'),
    styleReferenceAssetIds: getTaskReferenceAssetIds(task, 'style'),
    personalReferenceAssets: getTaskReferenceAssets(task, 'personal'),
    styleReferenceAssets: getTaskReferenceAssets(task, 'style'),
    generationParams: {
      model: task.model,
      quality: task.quality,
      size: task.size,
      outputFormat: task.output_format,
    },
    progress: {
      percent: task.progress_percent,
      step: task.progress_step,
      message: taskProgressMessage(task),
    },
    result: result ? mapResult(result) : null,
    error: task.error_code
      ? {
          code: task.error_code,
          message: task.error_message,
        }
      : null,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    sourceTaskId: task.source_task_id,
  };
}

export function mapResult(result: ResultRow) {
  const image = getAsset(result.image_asset_id);
  const thumb = result.thumbnail_asset_id ? getAsset(result.thumbnail_asset_id) : null;
  return {
    id: result.id,
    taskId: result.task_id,
    imageUrl: image?.public_url ?? null,
    thumbnailUrl: thumb?.public_url ?? null,
    width: image?.width ?? null,
    height: image?.height ?? null,
    savedToGallery: Boolean(result.saved_to_gallery),
    createdAt: result.created_at,
  };
}

export function mapGalleryItem(itemId: string) {
  const row = db
    .prepare(
      `SELECT g.*, r.task_id, image_asset.public_url as image_url, image_asset.width as image_width, image_asset.height as image_height,
              thumb_asset.public_url as thumbnail_url
       FROM gallery_items g
       JOIN generation_results r ON r.id = g.generation_result_id
       JOIN file_assets image_asset ON image_asset.id = r.image_asset_id
       LEFT JOIN file_assets thumb_asset ON thumb_asset.id = r.thumbnail_asset_id
       WHERE g.id = ?`
    )
    .get(itemId) as (GalleryRow & { task_id: string; image_url: string; image_width: number | null; image_height: number | null; thumbnail_url: string | null }) | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    generationResultId: row.generation_result_id,
    taskId: row.task_id,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url,
    width: row.image_width,
    height: row.image_height,
    isFavorited: Boolean(row.is_favorited),
    savedAt: row.saved_at,
  };
}

export function mapRecordItem(task: RecordRow) {
  return {
    id: task.id,
    status: task.status,
    promptSummary: getTaskSummary(task),
    summary: getTaskSummary(task),
    prompt: task.prompt,
    styleTags: parseStoredStyleTags(task.style_tags_json),
    personalReferenceAssets: getTaskReferenceAssets(task, 'personal'),
    styleReferenceAssets: getTaskReferenceAssets(task, 'style'),
    referenceTypes: [
      ...(getTaskReferenceAssetIds(task, 'personal').length > 0 ? ['personal_reference'] : []),
      ...(getTaskReferenceAssetIds(task, 'style').length > 0 ? ['style_reference'] : []),
    ],
    generationParams: {
      model: task.model,
      quality: task.quality,
      size: task.size,
      outputFormat: task.output_format,
    },
    progress: {
      percent: task.progress_percent,
      step: task.progress_step,
      message: taskProgressMessage(task),
    },
    result: task.result_id
      ? {
          id: task.result_id,
          taskId: task.id,
          imageUrl: task.image_url,
          thumbnailUrl: task.thumbnail_url,
          width: task.image_width,
          height: task.image_height,
          createdAt: task.completed_at ?? task.updated_at,
        }
      : null,
    errorMessage: task.error_message,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    sourceTaskId: task.source_task_id,
  };
}

export function getTaskSummary(task: TaskRow) {
  const storedSummary = task.summary ? normalizeTaskSummary(task.summary) : '';
  return storedSummary || buildFallbackTaskSummary({
    prompt: task.prompt,
    personalReferenceCount: getTaskReferenceAssetIds(task, 'personal').length,
    styleReferenceCount: getTaskReferenceAssetIds(task, 'style').length,
  });
}

export function getTaskReferenceAssetIds(task: TaskRow, type: 'personal' | 'style') {
  const jsonValue = type === 'personal' ? task.personal_reference_asset_ids_json : task.style_reference_asset_ids_json;
  const fallback = type === 'personal' ? task.personal_reference_asset_id : task.style_reference_asset_id;
  return parseStoredAssetIds(jsonValue, fallback);
}

export function getTaskReferenceAssets(task: TaskRow, type: 'personal' | 'style') {
  return getTaskReferenceAssetIds(task, type)
    .map((assetId) => getAsset(assetId))
    .filter((asset): asset is AssetRow => Boolean(asset))
    .map(mapAsset);
}

export function getProviderTaskReferenceAssetIds(task: ProviderTask, type: 'personal' | 'style') {
  return getTaskReferenceAssetIds(task as TaskRow, type);
}

export function parseStoredAssetIds(assetIdsJson: string | null, fallback: string | null) {
  const fallbackIds = fallback?.trim() ? [fallback] : [];
  if (!assetIdsJson) {
    return fallbackIds;
  }

  try {
    const parsed = JSON.parse(assetIdsJson) as unknown;
    if (!Array.isArray(parsed)) {
      return fallbackIds;
    }
    const ids = parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return ids.length > 0 ? ids : fallbackIds;
  } catch {
    return fallbackIds;
  }
}

export function mapSessionSummary(sessionId: string, sessionData: session.SessionData) {
  const sessionRow = getSession(sessionId);
  return {
    id: sessionId,
    expiresAt: sessionRow?.expires_at ?? getSessionExpiry(sessionData),
    authMode: (sessionData.authMode ?? 'mock') as AuthMode,
  };
}

export function taskProgressMessage(task: TaskRow) {
  if (task.status === 'completed') {
    return '暗房作品已完成';
  }
  if (task.status === 'failed') {
    return '暗房生成失败';
  }
  return '暗房生成进行中';
}

export function parseStoredStyleTags(styleTagsJson: string) {
  try {
    const parsed = JSON.parse(styleTagsJson) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  } catch {
    return [];
  }
}

export function isTerminalTaskStatus(status: TaskStatus) {
  return status === 'completed' || status === 'failed' || status === 'canceled';
}
