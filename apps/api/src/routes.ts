import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import {
  authMode,
  buildFrontendUrl,
  dataRoot,
  defaultImageModel,
  defaultImageQuality,
  oidcPostLogoutRedirectUri,
  webDistRoot,
  webIndexPath,
} from './config';
import { requireAuth, clearOidcHandshake, completeMockLogin, exchangeOidcCode, getOidcDiscovery, getOidcEndSessionEndpoint, redirectToLoginError, startOidcLogin, upsertOidcUser, verifyOidcIdToken } from './auth';
import { db, getOwnedAsset, getOwnedTask, getResultByTaskId, getSession, getUser } from './database';
import { createUploadedAsset } from './assets';
import { detectImageFile, normalizeOpenAiSize } from './image-utils';
import { analyzeStyleReferenceAssets, buildFallbackTaskSummary } from './openai-generation';
import {
  createGenerationTask,
  getQueueItems,
  getRecordPage,
  normalizeAssetIdList,
  startGenerationRun,
  syncAndGetOwnedTask,
  syncUserTasks,
} from './generation';
import {
  getTaskReferenceAssetIds,
  getTaskReferenceAssets,
  getTaskSummary,
  isTerminalTaskStatus,
  mapAsset,
  mapGalleryItem,
  mapResult,
  mapSessionSummary,
  mapTask,
  mapUser,
  parseStoredStyleTags,
  taskProgressMessage,
} from './mappers';
import { prepareSseResponse, setPrivateMediaHeaders, writeSseEvent } from './http-utils';
import { parsePaginationCursor, parsePaginationLimit } from './pagination';
import type { GalleryRow, ResultRow, TaskRow } from './types';
import { createId, destroySession, getRouteParam, isValidationLikeError, nowIso, saveSession, sendError } from './utils';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function registerStaticRoutes(app: Express) {
  app.use('/static/uploads', express.static(path.join(dataRoot, 'uploads'), { setHeaders: setPrivateMediaHeaders }));
  app.use('/static/generated', express.static(path.join(dataRoot, 'generated'), { setHeaders: setPrivateMediaHeaders }));
  if (fs.existsSync(webIndexPath)) {
    app.use(express.static(webDistRoot, { index: false }));
  }
}

export function registerApiRoutes(app: Express) {
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.session.userId) {
      res.json({ user: null, session: null });
      return;
    }

    const user = getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {
        res.clearCookie('dayu.sid');
        res.json({ user: null, session: null });
      });
      return;
    }

    res.json({
      user: mapUser(user),
      session: mapSessionSummary(req.sessionID, req.session),
    });
  });

  app.get('/api/auth/login', async (req, res) => {
    try {
      if (authMode === 'mock') {
        await completeMockLogin(req, '大宇体验用户');
        res.redirect(buildFrontendUrl('/'));
        return;
      }

      await startOidcLogin(req, res);
    } catch {
      redirectToLoginError(res, '统一登录暂时不可用，请稍后重试');
    }
  });

  app.get('/api/auth/callback', async (req, res) => {
    if (authMode !== 'oidc') {
      redirectToLoginError(res, '当前环境未启用统一登录回调');
      return;
    }

    const error = getRouteParam(req.query.error as string | string[] | undefined);
    if (error) {
      redirectToLoginError(res, error === 'access_denied' ? '你已取消统一登录' : '统一登录失败，请重试');
      return;
    }

    const code = getRouteParam(req.query.code as string | string[] | undefined);
    const state = getRouteParam(req.query.state as string | string[] | undefined);

    if (!code || !state) {
      redirectToLoginError(res, '统一登录回调缺少必要参数');
      return;
    }

    if (!req.session.oidcState || !req.session.oidcCodeVerifier || !req.session.oidcNonce) {
      redirectToLoginError(res, '登录状态已失效，请重新发起登录');
      return;
    }

    if (state !== req.session.oidcState) {
      clearOidcHandshake(req.session);
      await saveSession(req.session);
      redirectToLoginError(res, '登录状态校验失败，请重新发起登录');
      return;
    }

    try {
      const discovery = await getOidcDiscovery();
      const tokenResponse = await exchangeOidcCode(discovery, code, req.session.oidcCodeVerifier);
      const idToken = tokenResponse.id_token;

      if (!idToken) {
        throw new Error('missing_id_token');
      }

      const claims = await verifyOidcIdToken(idToken, discovery, req.session.oidcNonce);
      const providerSubject = typeof claims.sub === 'string' ? claims.sub.trim() : '';

      if (!providerSubject) {
        throw new Error('missing_sub');
      }

      const userId = upsertOidcUser(claims, providerSubject);
      req.session.userId = userId;
      req.session.authMode = 'oidc';
      req.session.oidcIdToken = idToken;
      clearOidcHandshake(req.session);
      await saveSession(req.session);
      res.redirect(buildFrontendUrl('/'));
    } catch {
      clearOidcHandshake(req.session);
      delete req.session.oidcIdToken;
      await saveSession(req.session);
      redirectToLoginError(res, '统一登录校验失败，请重新尝试');
    }
  });

  app.post('/api/auth/mock-login', async (req, res, next) => {
    if (authMode !== 'mock') {
      sendError(res, 400, 'VALIDATION_ERROR', '当前环境未启用模拟登录');
      return;
    }

    try {
      const displayName = typeof req.body?.displayName === 'string' && req.body.displayName.trim() ? req.body.displayName.trim() : '大宇体验用户';
      const userId = await completeMockLogin(req, displayName);
      const user = getUser(userId);
      const sessionRow = getSession(req.sessionID);

      res.json({
        user: user ? mapUser(user) : null,
        session: {
          id: req.sessionID,
          expiresAt: sessionRow?.expires_at ?? null,
          authMode: 'mock',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      const providerLogoutAvailable =
        req.session.authMode === 'oidc' && Boolean(req.session.oidcIdToken) && Boolean(await getOidcEndSessionEndpoint());

      if (providerLogoutAvailable) {
        res.json({
          success: true,
          postLogoutRedirectUrl: '/api/auth/logout/provider',
        });
        return;
      }

      await destroySession(req);
      res.clearCookie('dayu.sid');
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/logout/provider', async (req, res) => {
    const idTokenHint = req.session.oidcIdToken;
    const endSessionEndpoint = await getOidcEndSessionEndpoint();

    await destroySession(req);
    res.clearCookie('dayu.sid');

    if (!idTokenHint || !endSessionEndpoint) {
      res.redirect(buildFrontendUrl('/login'));
      return;
    }

    const logoutUrl = new URL(endSessionEndpoint);
    logoutUrl.searchParams.set('id_token_hint', idTokenHint);
    if (oidcPostLogoutRedirectUri) {
      logoutUrl.searchParams.set('post_logout_redirect_uri', oidcPostLogoutRedirectUri);
    }

    res.redirect(logoutUrl.toString());
  });

  app.post('/api/uploads', requireAuth, upload.single('file'), (req, res) => {
    const category = req.body?.category;
    const file = req.file;

    if (category !== 'personal_reference' && category !== 'style_reference') {
      sendError(res, 400, 'VALIDATION_ERROR', 'category is required');
      return;
    }

    if (!file) {
      sendError(res, 400, 'VALIDATION_ERROR', 'file is required');
      return;
    }

    const imageFile = detectImageFile(file.buffer);
    if (!imageFile) {
      sendError(res, 400, 'VALIDATION_ERROR', 'file must be a PNG, JPG, or WEBP image');
      return;
    }

    const asset = createUploadedAsset(req.session.userId!, category, file, imageFile);
    res.status(201).json({ asset: mapAsset(asset) });
  });

  app.get('/api/uploads/:assetId', requireAuth, (req, res) => {
    const assetId = getRouteParam(req.params.assetId);
    const asset = getOwnedAsset(req.session.userId!, assetId);

    if (!asset) {
      sendError(res, 404, 'NOT_FOUND', 'asset not found');
      return;
    }

    res.json({ asset: mapAsset(asset) });
  });

  app.post('/api/style-reference-analysis', requireAuth, async (req, res, next) => {
    try {
      const assetIds = normalizeAssetIdList(req.body?.assetIds, null, 3);
      if (assetIds.length === 0) {
        sendError(res, 400, 'VALIDATION_ERROR', 'assetIds is required');
        return;
      }

      const assets = [];
      for (const assetId of assetIds) {
        const asset = getOwnedAsset(req.session.userId!, assetId);
        if (!asset || asset.category !== 'style_reference') {
          sendError(res, 400, 'VALIDATION_ERROR', 'style reference asset is invalid');
          return;
        }
        assets.push(asset);
      }

      res.json({ analysis: await analyzeStyleReferenceAssets(assets) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/generation-tasks', requireAuth, async (req, res, next) => {
    try {
      const personalReferenceAssetIds = normalizeAssetIdList(req.body?.personalReferenceAssetIds, req.body?.personalReferenceAssetId, 3);
      const styleReferenceAssetIds = normalizeAssetIdList(req.body?.styleReferenceAssetIds, req.body?.styleReferenceAssetId ?? null, 3);
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      const requestedQuantity = Number(req.body?.quantity ?? 1);
      const quantity = Number.isFinite(requestedQuantity) ? Math.max(1, Math.min(8, Math.floor(requestedQuantity))) : 1;
      const generationParams = req.body?.generationParams ?? {};

      if (!prompt && (personalReferenceAssetIds.length === 0 || styleReferenceAssetIds.length === 0)) {
        sendError(res, 400, 'VALIDATION_ERROR', 'custom text is required unless both source and reference images are uploaded');
        return;
      }

      for (const assetId of personalReferenceAssetIds) {
        const personalAsset = getOwnedAsset(req.session.userId!, assetId);
        if (!personalAsset || personalAsset.category !== 'personal_reference') {
          sendError(res, 400, 'VALIDATION_ERROR', 'source image asset is invalid');
          return;
        }
      }

      for (const assetId of styleReferenceAssetIds) {
        const styleAsset = getOwnedAsset(req.session.userId!, assetId);
        if (!styleAsset || styleAsset.category !== 'style_reference') {
          sendError(res, 400, 'VALIDATION_ERROR', 'reference image asset is invalid');
          return;
        }
      }

      const model = typeof generationParams.model === 'string' ? generationParams.model : defaultImageModel;
      const quality = typeof generationParams.quality === 'string' ? generationParams.quality : defaultImageQuality;
      const size = normalizeOpenAiSize(typeof generationParams.size === 'string' ? generationParams.size : '1024x1536');
      const outputFormat = typeof generationParams.outputFormat === 'string' ? generationParams.outputFormat : 'png';
      const styleTags: string[] = [];
      const summary = buildFallbackTaskSummary({
        prompt,
        personalReferenceCount: personalReferenceAssetIds.length,
        styleReferenceCount: styleReferenceAssetIds.length,
      });

      const tasks = Array.from({ length: quantity }, () =>
        createGenerationTask({
          userId: req.session.userId!,
          prompt,
          styleTags,
          summary,
          personalReferenceAssetId: personalReferenceAssetIds[0] ?? '',
          styleReferenceAssetId: styleReferenceAssetIds[0] ?? null,
          personalReferenceAssetIds,
          styleReferenceAssetIds,
          model,
          quality,
          size,
          outputFormat,
          sourceTaskId: null,
        })
      );

      for (const task of tasks) {
        void startGenerationRun(task.id);
      }

      res.status(201).json({
        task: mapTask(tasks[0]!),
        tasks: tasks.map((task) => mapTask(task)),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/generation-tasks/:taskId', requireAuth, async (req, res, next) => {
    try {
      const taskId = getRouteParam(req.params.taskId);
      const task = await syncAndGetOwnedTask(req.session.userId!, taskId);

      if (!task) {
        sendError(res, 404, 'NOT_FOUND', 'task not found');
        return;
      }

      res.json({ task: mapTask(task, true) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/generation-tasks/:taskId/events', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const taskId = getRouteParam(req.params.taskId);
      const initialTask = await syncAndGetOwnedTask(userId, taskId);

      if (!initialTask) {
        sendError(res, 404, 'NOT_FOUND', 'task not found');
        return;
      }

      prepareSseResponse(res);
      let lastSerialized = '';
      let timer: NodeJS.Timeout | null = null;
      let closed = false;

      const closeStream = () => {
        closed = true;
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        if (!res.writableEnded) {
          res.end();
        }
      };

      const sendSnapshot = async () => {
        if (closed) {
          return;
        }

        const task = await syncAndGetOwnedTask(userId, taskId);
        if (!task) {
          writeSseEvent(res, 'error', { message: 'task not found' });
          closeStream();
          return;
        }

        const payload = { task: mapTask(task, true) };
        const serialized = JSON.stringify(payload);
        if (serialized !== lastSerialized) {
          lastSerialized = serialized;
          writeSseEvent(res, 'task', payload);
        }

        if (isTerminalTaskStatus(task.status)) {
          closeStream();
        }
      };

      req.on('close', closeStream);
      await sendSnapshot();
      if (!closed) {
        timer = setInterval(() => {
          void sendSnapshot().catch(() => {
            writeSseEvent(res, 'error', { message: 'task stream failed' });
            closeStream();
          });
        }, 1000);
      }
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/generation-tasks/:taskId/progress', requireAuth, async (req, res, next) => {
    try {
      const taskId = getRouteParam(req.params.taskId);
      const task = await syncAndGetOwnedTask(req.session.userId!, taskId);

      if (!task) {
        sendError(res, 404, 'NOT_FOUND', 'task not found');
        return;
      }

      res.json({
        taskId: task.id,
        status: task.status,
        progress: {
          percent: task.progress_percent,
          step: task.progress_step,
          message: taskProgressMessage(task),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/generation-tasks/:taskId/result', requireAuth, async (req, res, next) => {
    try {
      const taskId = getRouteParam(req.params.taskId);
      const task = await syncAndGetOwnedTask(req.session.userId!, taskId);

      if (!task) {
        sendError(res, 404, 'NOT_FOUND', 'task not found');
        return;
      }

      if (task.status !== 'completed') {
        sendError(res, 409, 'INVALID_STATE', 'task is not completed yet');
        return;
      }

      const result = getResultByTaskId(task.id);
      if (!result) {
        sendError(res, 404, 'NOT_FOUND', 'result not found');
        return;
      }

      res.json({ result: mapResult(result) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/generation-tasks/:taskId/fine-tune', requireAuth, async (req, res, next) => {
    try {
      const taskId = getRouteParam(req.params.taskId);
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';

      if (!prompt) {
        sendError(res, 400, 'VALIDATION_ERROR', '请填写微调需求');
        return;
      }

      const sourceTask = await syncAndGetOwnedTask(req.session.userId!, taskId);
      if (!sourceTask) {
        sendError(res, 404, 'NOT_FOUND', '任务不存在');
        return;
      }

      if (sourceTask.status !== 'completed') {
        sendError(res, 409, 'INVALID_STATE', '只能微调已完成的任务');
        return;
      }

      const result = getResultByTaskId(sourceTask.id);
      if (!result) {
        sendError(res, 404, 'NOT_FOUND', '生成结果不存在');
        return;
      }

      const imageAsset = getOwnedAsset(req.session.userId!, result.image_asset_id);
      if (!imageAsset) {
        sendError(res, 404, 'NOT_FOUND', '生成结果图片不可用');
        return;
      }

      if (imageAsset.category !== 'generated_result') {
        sendError(res, 409, 'INVALID_STATE', '生成结果图片不可用');
        return;
      }

      const task = createGenerationTask({
        userId: sourceTask.user_id,
        prompt,
        styleTags: [],
        summary: buildFallbackTaskSummary({
          prompt,
          personalReferenceCount: 1,
          styleReferenceCount: 0,
        }),
        personalReferenceAssetId: imageAsset.id,
        styleReferenceAssetId: null,
        personalReferenceAssetIds: [imageAsset.id],
        styleReferenceAssetIds: [],
        model: sourceTask.model || defaultImageModel,
        quality: sourceTask.quality || defaultImageQuality,
        size: sourceTask.size || normalizeOpenAiSize('1024x1536'),
        outputFormat: sourceTask.output_format || 'png',
        sourceTaskId: sourceTask.id,
      });

      void startGenerationRun(task.id);
      res.status(201).json({ task: mapTask(task) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/generation-tasks/:taskId/cancel', requireAuth, (req, res) => {
    const taskId = getRouteParam(req.params.taskId);
    const task = getOwnedTask(req.session.userId!, taskId);

    if (!task) {
      sendError(res, 404, 'NOT_FOUND', 'task not found');
      return;
    }

    if (isTerminalTaskStatus(task.status)) {
      sendError(res, 409, 'INVALID_STATE', 'only active tasks can be canceled');
      return;
    }

    const now = nowIso();
    db.prepare("UPDATE generation_tasks SET status = 'canceled', progress_step = '任务已取消', updated_at = ?, completed_at = ?, deleted_at = ? WHERE id = ?").run(
      now,
      now,
      now,
      task.id
    );
    res.json({ success: true });
  });

  app.post('/api/generation-tasks/:taskId/retry', requireAuth, (req, res) => {
    const taskId = getRouteParam(req.params.taskId);
    const sourceTask = getOwnedTask(req.session.userId!, taskId);

    if (!sourceTask) {
      sendError(res, 404, 'NOT_FOUND', 'task not found');
      return;
    }

    const personalReferenceAssetIds = getTaskReferenceAssetIds(sourceTask, 'personal');
    const styleReferenceAssetIds = getTaskReferenceAssetIds(sourceTask, 'style');
    const styleTags = parseStoredStyleTags(sourceTask.style_tags_json);
    const task = createGenerationTask({
      userId: sourceTask.user_id,
      prompt: sourceTask.prompt,
      styleTags,
      summary: getTaskSummary(sourceTask),
      personalReferenceAssetId: personalReferenceAssetIds[0] ?? '',
      styleReferenceAssetId: styleReferenceAssetIds[0] ?? null,
      personalReferenceAssetIds,
      styleReferenceAssetIds,
      model: sourceTask.model,
      quality: sourceTask.quality,
      size: sourceTask.size,
      outputFormat: sourceTask.output_format,
      sourceTaskId: sourceTask.id,
    });

    void startGenerationRun(task.id);
    res.status(201).json({ task: mapTask(task) });
  });

  app.get('/api/records', requireAuth, async (req, res, next) => {
    try {
      const page = await getRecordPage(req.session.userId!, parsePaginationLimit(req.query.limit), parsePaginationCursor(req.query.cursor));
      res.json(page);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/records/:taskId', requireAuth, (req, res) => {
    const taskId = getRouteParam(req.params.taskId);
    const task = getOwnedTask(req.session.userId!, taskId);

    if (!task) {
      sendError(res, 404, 'NOT_FOUND', 'task not found');
      return;
    }

    if (task.status === 'queued' || task.status === 'processing') {
      sendError(res, 409, 'INVALID_STATE', 'cancel active tasks before deleting them');
      return;
    }

    const result = getResultByTaskId(task.id);
    const now = nowIso();
    db.prepare('UPDATE generation_tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, task.id);
    if (result) {
      db.prepare('UPDATE gallery_items SET deleted_at = ? WHERE generation_result_id = ? AND user_id = ? AND deleted_at IS NULL').run(
        now,
        result.id,
        req.session.userId!
      );
      db.prepare('UPDATE generation_results SET saved_to_gallery = 0 WHERE id = ?').run(result.id);
    }
    res.json({ success: true });
  });

  app.get('/api/records/events', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      prepareSseResponse(res);
      let lastSerialized = '';
      let timer: NodeJS.Timeout | null = null;
      let closed = false;

      const closeStream = () => {
        closed = true;
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        if (!res.writableEnded) {
          res.end();
        }
      };

      const sendSnapshot = async () => {
        if (closed) {
          return;
        }

        const payload = await getRecordPage(userId, 10, 0);
        const serialized = JSON.stringify(payload);
        if (serialized !== lastSerialized) {
          lastSerialized = serialized;
          writeSseEvent(res, 'records', payload);
        }
      };

      req.on('close', closeStream);
      await sendSnapshot();
      if (!closed) {
        timer = setInterval(() => {
          void sendSnapshot().catch(() => {
            writeSseEvent(res, 'error', { message: 'records stream failed' });
            closeStream();
          });
        }, 1500);
      }
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/queue', requireAuth, async (req, res, next) => {
    try {
      const items = await getQueueItems(req.session.userId!);
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/queue/events', requireAuth, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      prepareSseResponse(res);
      let lastSerialized = '';
      let timer: NodeJS.Timeout | null = null;
      let closed = false;

      const closeStream = () => {
        closed = true;
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        if (!res.writableEnded) {
          res.end();
        }
      };

      const sendSnapshot = async () => {
        if (closed) {
          return;
        }

        const payload = { items: await getQueueItems(userId) };
        const serialized = JSON.stringify(payload);
        if (serialized !== lastSerialized) {
          lastSerialized = serialized;
          writeSseEvent(res, 'queue', payload);
        }
      };

      req.on('close', closeStream);
      await sendSnapshot();
      if (!closed) {
        timer = setInterval(() => {
          void sendSnapshot().catch(() => {
            writeSseEvent(res, 'error', { message: 'queue stream failed' });
            closeStream();
          });
        }, 1500);
      }
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/history', requireAuth, async (req, res, next) => {
    try {
      await syncUserTasks(req.session.userId!);
      const rows = db
        .prepare(
          `SELECT t.*, r.id as result_id, image_asset.public_url as result_image_url
           FROM generation_tasks t
           LEFT JOIN generation_results r ON r.task_id = t.id
           LEFT JOIN file_assets image_asset ON image_asset.id = r.image_asset_id AND image_asset.deleted_at IS NULL
           WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.status != 'canceled'
           ORDER BY datetime(t.created_at) DESC`
        )
        .all(req.session.userId!) as Array<TaskRow & { result_id: string | null; result_image_url: string | null }>;

      res.json({
        items: rows.map((task) => ({
          id: task.id,
          status: task.status,
          promptSummary: getTaskSummary(task),
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
          resultImageUrl: task.result_image_url,
          createdAt: task.created_at,
          sourceTaskId: task.source_task_id,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/gallery-items', requireAuth, (req, res) => {
    const rows = db
      .prepare(
        `SELECT g.*, r.task_id, image_asset.public_url as image_url, image_asset.width as image_width, image_asset.height as image_height,
                thumb_asset.public_url as thumbnail_url
         FROM gallery_items g
         JOIN generation_results r ON r.id = g.generation_result_id
         JOIN file_assets image_asset ON image_asset.id = r.image_asset_id AND image_asset.deleted_at IS NULL
         LEFT JOIN file_assets thumb_asset ON thumb_asset.id = r.thumbnail_asset_id AND thumb_asset.deleted_at IS NULL
         JOIN generation_tasks t ON t.id = r.task_id
         WHERE g.user_id = ? AND g.deleted_at IS NULL AND t.deleted_at IS NULL
         ORDER BY datetime(g.saved_at) DESC`
      )
      .all(req.session.userId!) as Array<GalleryRow & { task_id: string; image_url: string; image_width: number | null; image_height: number | null; thumbnail_url: string | null }>;

    res.json({
      items: rows.map((item) => ({
        id: item.id,
        generationResultId: item.generation_result_id,
        taskId: item.task_id,
        imageUrl: item.image_url,
        thumbnailUrl: item.thumbnail_url,
        width: item.image_width,
        height: item.image_height,
        isFavorited: Boolean(item.is_favorited),
        savedAt: item.saved_at,
      })),
    });
  });

  app.post('/api/gallery-items', requireAuth, (req, res) => {
    const generationResultId = req.body?.generationResultId;
    if (typeof generationResultId !== 'string') {
      sendError(res, 400, 'VALIDATION_ERROR', 'generationResultId is required');
      return;
    }

    const result = db
      .prepare(
        `SELECT r.* FROM generation_results r
         JOIN generation_tasks t ON t.id = r.task_id
         WHERE r.id = ? AND t.user_id = ? AND t.deleted_at IS NULL`
      )
      .get(generationResultId, req.session.userId!) as ResultRow | undefined;

    if (!result) {
      sendError(res, 404, 'NOT_FOUND', 'result not found');
      return;
    }

    const existing = db.prepare('SELECT * FROM gallery_items WHERE generation_result_id = ? AND user_id = ?').get(generationResultId, req.session.userId!) as GalleryRow | undefined;
    if (existing?.deleted_at === null) {
      res.json({ item: mapGalleryItem(existing.id) });
      return;
    }

    const now = nowIso();
    const id = existing?.id ?? createId('gal');
    if (existing) {
      db.prepare('UPDATE gallery_items SET is_favorited = 0, saved_at = ?, deleted_at = NULL WHERE id = ?').run(now, existing.id);
    } else {
      db.prepare('INSERT INTO gallery_items (id, user_id, generation_result_id, is_favorited, saved_at, deleted_at) VALUES (?, ?, ?, 0, ?, NULL)').run(
        id,
        req.session.userId!,
        generationResultId,
        now
      );
    }
    db.prepare('UPDATE generation_results SET saved_to_gallery = 1 WHERE id = ?').run(generationResultId);

    res.status(201).json({ item: mapGalleryItem(id) });
  });

  app.patch('/api/gallery-items/:itemId', requireAuth, (req, res) => {
    const itemId = getRouteParam(req.params.itemId);
    const item = db
      .prepare('SELECT * FROM gallery_items WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
      .get(itemId, req.session.userId!) as GalleryRow | undefined;

    if (!item) {
      sendError(res, 404, 'NOT_FOUND', 'gallery item not found');
      return;
    }

    const isFavorited = req.body?.isFavorited === true;
    db.prepare('UPDATE gallery_items SET is_favorited = ? WHERE id = ?').run(isFavorited ? 1 : 0, item.id);
    res.json({ item: mapGalleryItem(item.id) });
  });

  app.post('/api/users/me/avatar', requireAuth, (req, res) => {
    const galleryItemId = typeof req.body?.galleryItemId === 'string' ? req.body.galleryItemId : '';
    const row = db
      .prepare(
        `SELECT image_asset.id as asset_id
         FROM gallery_items g
         JOIN generation_results r ON r.id = g.generation_result_id
         JOIN generation_tasks t ON t.id = r.task_id
         JOIN file_assets image_asset ON image_asset.id = r.image_asset_id AND image_asset.deleted_at IS NULL
         WHERE g.id = ? AND g.user_id = ? AND g.deleted_at IS NULL AND t.deleted_at IS NULL`
      )
      .get(galleryItemId, req.session.userId!) as { asset_id: string } | undefined;

    if (!row) {
      sendError(res, 404, 'NOT_FOUND', 'gallery item not found');
      return;
    }

    db.prepare('UPDATE users SET avatar_asset_id = ?, updated_at = ? WHERE id = ?').run(row.asset_id, nowIso(), req.session.userId!);
    res.json({ user: mapUser(getUser(req.session.userId!)!) });
  });

  app.delete('/api/gallery-items/:itemId', requireAuth, (req, res) => {
    const itemId = getRouteParam(req.params.itemId);
    const item = db
      .prepare('SELECT * FROM gallery_items WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
      .get(itemId, req.session.userId!) as GalleryRow | undefined;

    if (!item) {
      sendError(res, 404, 'NOT_FOUND', 'gallery item not found');
      return;
    }

    db.prepare('UPDATE gallery_items SET deleted_at = ? WHERE id = ?').run(nowIso(), item.id);
    db.prepare('UPDATE generation_results SET saved_to_gallery = 0 WHERE id = ?').run(item.generation_result_id);
    res.json({ success: true });
  });

  app.get('/api/gallery-items/:itemId/download', requireAuth, (req, res) => {
    const itemId = getRouteParam(req.params.itemId);
    const row = db
      .prepare(
        `SELECT image_asset.storage_path, image_asset.file_name, image_asset.mime_type
         FROM gallery_items g
         JOIN generation_results r ON r.id = g.generation_result_id
         JOIN generation_tasks t ON t.id = r.task_id
         JOIN file_assets image_asset ON image_asset.id = r.image_asset_id AND image_asset.deleted_at IS NULL
         WHERE g.id = ? AND g.user_id = ? AND g.deleted_at IS NULL AND t.deleted_at IS NULL`
      )
      .get(itemId, req.session.userId!) as { storage_path: string; file_name: string; mime_type: string } | undefined;

    if (!row) {
      sendError(res, 404, 'NOT_FOUND', 'gallery item not found');
      return;
    }

    const absolutePath = path.join(dataRoot, row.storage_path);
    res.type(row.mime_type);
    res.download(absolutePath, row.file_name);
  });
}

export function registerSpaFallback(app: Express) {
  app.get(/^(?!\/api(?:\/|$)|\/static(?:\/|$)).*/, (req, res, next) => {
    if (!fs.existsSync(webIndexPath)) {
      next();
      return;
    }

    if (!req.accepts('html')) {
      next();
      return;
    }

    res.sendFile(webIndexPath, (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

export function registerErrorHandler(app: Express) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const status = isValidationLikeError(err) ? 400 : 500;
    sendError(res, status, status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', status === 400 ? 'request is invalid' : 'internal server error');
  });
}

