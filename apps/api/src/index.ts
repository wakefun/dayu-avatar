import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import session from 'express-session';
import multer from 'multer';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    authMode?: 'mock' | 'oidc';
    oidcState?: string;
    oidcNonce?: string;
    oidcCodeVerifier?: string;
    oidcIdToken?: string;
  }
}

type AssetCategory = 'personal_reference' | 'style_reference' | 'generated_result' | 'generated_thumbnail';
type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
type AuthMode = 'mock' | 'oidc';
type GenerationMode = 'mock' | 'openai';

type UserRow = {
  id: string;
  display_name: string;
  email: string | null;
  avatar_asset_id: string | null;
  created_at: string;
  updated_at: string;
};

type AssetRow = {
  id: string;
  user_id: string;
  category: AssetCategory;
  storage_path: string;
  public_url: string;
  file_name: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  created_at: string;
};

type TaskRow = {
  id: string;
  user_id: string;
  status: TaskStatus;
  prompt: string;
  style_tags_json: string;
  personal_reference_asset_id: string;
  style_reference_asset_id: string | null;
  model: string;
  quality: string;
  size: string;
  output_format: string;
  progress_percent: number;
  progress_step: string | null;
  error_code: string | null;
  error_message: string | null;
  source_task_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type ResultRow = {
  id: string;
  task_id: string;
  image_asset_id: string;
  thumbnail_asset_id: string | null;
  saved_to_gallery: number;
  created_at: string;
};

type GalleryRow = {
  id: string;
  user_id: string;
  generation_result_id: string;
  is_favorited: number;
  saved_at: string;
};

type SessionRow = {
  id: string;
  user_id: string | null;
  auth_mode: AuthMode | null;
  expires_at: string | null;
};

type OidcDiscoveryDocument = {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri?: string;
  end_session_endpoint?: string;
  id_token_signing_alg_values_supported?: string[];
};

type OidcTokenResponse = {
  id_token?: string;
};

type OidcJwtHeader = {
  alg?: unknown;
  kid?: unknown;
};

type OidcJwk = crypto.JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
  kty?: string;
  crv?: string;
};

type OidcIdTokenClaims = {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  iat?: unknown;
  nonce?: unknown;
  name?: unknown;
  preferred_username?: unknown;
  email?: unknown;
};

type OpenAiErrorPayload = {
  code?: string | null;
  type?: string | null;
  message?: string | null;
};

type OpenAiImageData = {
  b64_json?: string;
  url?: string;
};

type OpenAiImagesResponse = {
  data?: OpenAiImageData[];
  error?: OpenAiErrorPayload;
};

type OpenAiGenerationFailure = {
  status: number | null;
  providerCode: string | null;
  providerType: string | null;
  providerMessage: string | null;
  internalCode: string;
  taskMessage: string;
};

type GeneratedImagePayload = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
};

const repoRoot = path.resolve(process.cwd(), '../..');
const dataRoot = path.join(repoRoot, 'data');
const uploadsRoot = path.join(dataRoot, 'uploads');
const generatedRoot = path.join(dataRoot, 'generated');
const dbPath = path.join(dataRoot, 'app.db');
const port = Number(process.env.PORT ?? 3001);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const sessionSecret = process.env.SESSION_SECRET ?? 'dayu-avatar-dev-secret';
const authMode = parseMode<AuthMode>(process.env.AUTH_MODE, ['mock', 'oidc'], 'mock');
const generationMode = parseMode<GenerationMode>(process.env.GENERATION_MODE, ['mock', 'openai'], 'mock');
const openAiBaseUrl = normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL);
const openAiApiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
const defaultImageModel = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2';
const defaultImageQuality = process.env.OPENAI_IMAGE_QUALITY?.trim() || 'high';
const oidcDiscoveryUrl = process.env.OIDC_DISCOVERY_URL ?? '';
const oidcClientId = process.env.OIDC_CLIENT_ID ?? '';
const oidcClientSecret = process.env.OIDC_CLIENT_SECRET ?? '';
const oidcRedirectUri = process.env.OIDC_REDIRECT_URI ?? '';
const oidcPostLogoutRedirectUri = process.env.OIDC_POST_LOGOUT_REDIRECT_URI ?? '';
const generationRuns = new Map<string, Promise<void>>();
let oidcDiscoveryPromise: Promise<OidcDiscoveryDocument> | null = null;
let oidcJwksPromise: Promise<OidcJwk[]> | null = null;
let oidcJwksUri: string | null = null;

fs.mkdirSync(uploadsRoot, { recursive: true });
fs.mkdirSync(generatedRoot, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

initSchema();

class SQLiteSessionStore extends session.Store {
  override get(sid: string, callback: (err?: unknown, sessionData?: session.SessionData | null) => void): void {
    try {
      const row = db
        .prepare('SELECT session_data FROM sessions WHERE id = ? AND deleted_at IS NULL')
        .get(sid) as { session_data: string } | undefined;

      if (!row) {
        callback(undefined, null);
        return;
      }

      callback(undefined, JSON.parse(row.session_data) as session.SessionData);
    } catch (error) {
      callback(error);
    }
  }

  override set(sid: string, sessionData: session.SessionData, callback?: (err?: unknown) => void): void {
    try {
      const expiresAt = getSessionExpiry(sessionData);
      const userId = typeof sessionData.userId === 'string' ? sessionData.userId : null;
      const storedAuthMode = (sessionData.authMode ?? null) as AuthMode | null;
      const now = nowIso();

      db.prepare(
        `INSERT INTO sessions (id, user_id, auth_mode, session_data, expires_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           user_id = excluded.user_id,
           auth_mode = excluded.auth_mode,
           session_data = excluded.session_data,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at,
           deleted_at = NULL`
      ).run(sid, userId, storedAuthMode, JSON.stringify(sessionData), expiresAt, now, now);

      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      const now = nowIso();
      db.prepare('UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override touch(sid: string, sessionData: session.SessionData, callback?: () => void): void {
    const expiresAt = getSessionExpiry(sessionData);
    db.prepare('UPDATE sessions SET expires_at = ?, session_data = ?, updated_at = ?, deleted_at = NULL WHERE id = ?').run(
      expiresAt,
      JSON.stringify(sessionData),
      nowIso(),
      sid
    );
    callback?.();
  }
}

const app = express();
app.set('trust proxy', 1);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(
  cors({
    origin: webOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    name: 'dayu.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new SQLiteSessionStore(),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);
app.use('/static/uploads', express.static(uploadsRoot));
app.use('/static/generated', express.static(generatedRoot));

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

  if (!file.mimetype.startsWith('image/')) {
    sendError(res, 400, 'VALIDATION_ERROR', 'file must be an image');
    return;
  }

  const asset = createUploadedAsset(req.session.userId!, category, file);
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

app.post('/api/generation-tasks', requireAuth, (req, res) => {
  const personalReferenceAssetId = req.body?.personalReferenceAssetId;
  const styleReferenceAssetId = req.body?.styleReferenceAssetId ?? null;
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const styleTags = Array.isArray(req.body?.styleTags)
    ? req.body.styleTags.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const generationParams = req.body?.generationParams ?? {};

  if (typeof personalReferenceAssetId !== 'string') {
    sendError(res, 400, 'VALIDATION_ERROR', 'personalReferenceAssetId is required');
    return;
  }

  const personalAsset = getOwnedAsset(req.session.userId!, personalReferenceAssetId);
  if (!personalAsset || personalAsset.category !== 'personal_reference') {
    sendError(res, 400, 'VALIDATION_ERROR', 'personal reference asset is invalid');
    return;
  }

  if (styleReferenceAssetId) {
    const styleAsset = getOwnedAsset(req.session.userId!, styleReferenceAssetId);
    if (!styleAsset || styleAsset.category !== 'style_reference') {
      sendError(res, 400, 'VALIDATION_ERROR', 'style reference asset is invalid');
      return;
    }
  }

  const task = createGenerationTask({
    userId: req.session.userId!,
    prompt,
    styleTags,
    personalReferenceAssetId,
    styleReferenceAssetId,
    model: typeof generationParams.model === 'string' ? generationParams.model : defaultImageModel,
    quality: typeof generationParams.quality === 'string' ? generationParams.quality : defaultImageQuality,
    size: typeof generationParams.size === 'string' ? generationParams.size : '1024x1536',
    outputFormat: typeof generationParams.outputFormat === 'string' ? generationParams.outputFormat : 'png',
    sourceTaskId: null,
  });

  res.status(201).json({ task: mapTask(task) });
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

app.post('/api/generation-tasks/:taskId/retry', requireAuth, (req, res) => {
  const taskId = getRouteParam(req.params.taskId);
  const sourceTask = getOwnedTask(req.session.userId!, taskId);

  if (!sourceTask) {
    sendError(res, 404, 'NOT_FOUND', 'task not found');
    return;
  }

  const task = createGenerationTask({
    userId: sourceTask.user_id,
    prompt: sourceTask.prompt,
    styleTags: JSON.parse(sourceTask.style_tags_json) as string[],
    personalReferenceAssetId: sourceTask.personal_reference_asset_id,
    styleReferenceAssetId: sourceTask.style_reference_asset_id,
    model: sourceTask.model,
    quality: sourceTask.quality,
    size: sourceTask.size,
    outputFormat: sourceTask.output_format,
    sourceTaskId: sourceTask.id,
  });

  res.status(201).json({ task: mapTask(task) });
});

app.get('/api/queue', requireAuth, async (req, res, next) => {
  try {
    await syncUserTasks(req.session.userId!);
    const rows = db
      .prepare('SELECT * FROM generation_tasks WHERE user_id = ? ORDER BY datetime(created_at) DESC')
      .all(req.session.userId!) as TaskRow[];

    res.json({
      items: rows.map((task) => ({
        id: task.id,
        status: task.status,
        progress: {
          percent: task.progress_percent,
          step: task.progress_step,
        },
        createdAt: task.created_at,
        resultUrl: task.status === 'completed' ? `/generate/result/${task.id}` : null,
        errorMessage: task.error_message,
      })),
    });
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
         LEFT JOIN file_assets image_asset ON image_asset.id = r.image_asset_id
         WHERE t.user_id = ?
         ORDER BY datetime(t.created_at) DESC`
      )
      .all(req.session.userId!) as Array<TaskRow & { result_id: string | null; result_image_url: string | null }>;

    res.json({
      items: rows.map((task) => ({
        id: task.id,
        status: task.status,
        promptSummary: task.prompt || '未填写提示词',
        referenceTypes: task.style_reference_asset_id ? ['personal_reference', 'style_reference'] : ['personal_reference'],
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
      `SELECT g.*, r.task_id, image_asset.public_url as image_url, thumb_asset.public_url as thumbnail_url
       FROM gallery_items g
       JOIN generation_results r ON r.id = g.generation_result_id
       JOIN file_assets image_asset ON image_asset.id = r.image_asset_id
       LEFT JOIN file_assets thumb_asset ON thumb_asset.id = r.thumbnail_asset_id
       WHERE g.user_id = ?
       ORDER BY datetime(g.saved_at) DESC`
    )
    .all(req.session.userId!) as Array<GalleryRow & { task_id: string; image_url: string; thumbnail_url: string | null }>;

  res.json({
    items: rows.map((item) => ({
      id: item.id,
      generationResultId: item.generation_result_id,
      taskId: item.task_id,
      imageUrl: item.image_url,
      thumbnailUrl: item.thumbnail_url,
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
       WHERE r.id = ? AND t.user_id = ?`
    )
    .get(generationResultId, req.session.userId!) as ResultRow | undefined;

  if (!result) {
    sendError(res, 404, 'NOT_FOUND', 'result not found');
    return;
  }

  const existing = db.prepare('SELECT * FROM gallery_items WHERE generation_result_id = ?').get(generationResultId) as GalleryRow | undefined;
  if (existing) {
    res.json({ item: mapGalleryItem(existing.id) });
    return;
  }

  const now = nowIso();
  const id = createId('gal');
  db.prepare('INSERT INTO gallery_items (id, user_id, generation_result_id, is_favorited, saved_at) VALUES (?, ?, ?, 0, ?)').run(
    id,
    req.session.userId!,
    generationResultId,
    now
  );
  db.prepare('UPDATE generation_results SET saved_to_gallery = 1 WHERE id = ?').run(generationResultId);

  res.status(201).json({ item: mapGalleryItem(id) });
});

app.patch('/api/gallery-items/:itemId', requireAuth, (req, res) => {
  const itemId = getRouteParam(req.params.itemId);
  const item = db
    .prepare('SELECT * FROM gallery_items WHERE id = ? AND user_id = ?')
    .get(itemId, req.session.userId!) as GalleryRow | undefined;

  if (!item) {
    sendError(res, 404, 'NOT_FOUND', 'gallery item not found');
    return;
  }

  const isFavorited = Boolean(req.body?.isFavorited);
  db.prepare('UPDATE gallery_items SET is_favorited = ? WHERE id = ?').run(isFavorited ? 1 : 0, item.id);
  res.json({ item: mapGalleryItem(item.id) });
});

app.delete('/api/gallery-items/:itemId', requireAuth, (req, res) => {
  const itemId = getRouteParam(req.params.itemId);
  const item = db
    .prepare('SELECT * FROM gallery_items WHERE id = ? AND user_id = ?')
    .get(itemId, req.session.userId!) as GalleryRow | undefined;

  if (!item) {
    sendError(res, 404, 'NOT_FOUND', 'gallery item not found');
    return;
  }

  db.prepare('DELETE FROM gallery_items WHERE id = ?').run(item.id);
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
       JOIN file_assets image_asset ON image_asset.id = r.image_asset_id
       WHERE g.id = ? AND g.user_id = ?`
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

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  void next;
  if (res.headersSent) {
    return;
  }
  const status = isValidationLikeError(err) ? 400 : 500;
  sendError(res, status, status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', status === 400 ? 'request is invalid' : 'internal server error');
});

app.listen(port, () => {
  console.log(`dayu api listening on http://localhost:${port} (auth=${authMode}, generation=${generationMode})`);
});

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT,
      avatar_asset_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, provider_subject)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      auth_mode TEXT,
      session_data TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS file_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      storage_disk TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      public_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      byte_size INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      style_tags_json TEXT NOT NULL,
      personal_reference_asset_id TEXT NOT NULL,
      style_reference_asset_id TEXT,
      model TEXT NOT NULL,
      quality TEXT NOT NULL,
      size TEXT NOT NULL,
      output_format TEXT NOT NULL,
      progress_percent INTEGER NOT NULL DEFAULT 0,
      progress_step TEXT,
      error_code TEXT,
      error_message TEXT,
      source_task_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS generation_results (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL UNIQUE,
      image_asset_id TEXT NOT NULL,
      thumbnail_asset_id TEXT,
      saved_to_gallery INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gallery_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      generation_result_id TEXT NOT NULL UNIQUE,
      is_favorited INTEGER NOT NULL DEFAULT 0,
      saved_at TEXT NOT NULL
    );
  `);
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    sendError(res, 401, 'UNAUTHORIZED', 'login required');
    return;
  }

  const user = getUser(req.session.userId);
  if (!user) {
    sendError(res, 401, 'UNAUTHORIZED', 'session is invalid');
    return;
  }

  next();
}

async function completeMockLogin(req: Request, displayName: string) {
  const normalizedDisplayName = displayName.trim() || '大宇体验用户';
  const email = `${slugify(normalizedDisplayName)}@mock.dayu.local`;
  const providerSubject = `mock:${email}`;
  const account = db
    .prepare('SELECT user_id FROM auth_accounts WHERE provider = ? AND provider_subject = ?')
    .get('mock', providerSubject) as { user_id: string } | undefined;

  const userId = account?.user_id ?? createUser(normalizedDisplayName, email);
  upsertMockAccount(userId, providerSubject);
  ensureSeedTasks(userId);

  req.session.userId = userId;
  req.session.authMode = 'mock';
  delete req.session.oidcIdToken;
  clearOidcHandshake(req.session);
  await saveSession(req.session);
  return userId;
}

async function startOidcLogin(req: Request, res: Response) {
  ensureOidcConfigured();
  const discovery = await getOidcDiscovery();
  const state = randomUrlSafeToken(24);
  const nonce = randomUrlSafeToken(24);
  const codeVerifier = randomUrlSafeToken(48);
  const codeChallenge = createPkceChallenge(codeVerifier);

  req.session.oidcState = state;
  req.session.oidcNonce = nonce;
  req.session.oidcCodeVerifier = codeVerifier;
  delete req.session.oidcIdToken;
  await saveSession(req.session);

  const authorizationUrl = new URL(discovery.authorization_endpoint);
  authorizationUrl.searchParams.set('client_id', oidcClientId);
  authorizationUrl.searchParams.set('redirect_uri', oidcRedirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', 'openid profile email');
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('nonce', nonce);
  authorizationUrl.searchParams.set('code_challenge', codeChallenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  res.redirect(authorizationUrl.toString());
}

function clearOidcHandshake(sessionData: session.SessionData) {
  delete sessionData.oidcState;
  delete sessionData.oidcNonce;
  delete sessionData.oidcCodeVerifier;
}

function createUser(displayName: string, email: string | null) {
  const id = createId('usr');
  const now = nowIso();
  db.prepare('INSERT INTO users (id, display_name, email, avatar_asset_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)').run(
    id,
    displayName,
    email,
    now,
    now
  );
  return id;
}

function updateUser(userId: string, displayName: string, email: string | null) {
  db.prepare('UPDATE users SET display_name = ?, email = ?, updated_at = ? WHERE id = ?').run(displayName, email, nowIso(), userId);
}

function upsertMockAccount(userId: string, providerSubject: string) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO auth_accounts (id, user_id, provider, provider_subject, last_login_at, created_at, updated_at)
     VALUES (?, ?, 'mock', ?, ?, ?, ?)
     ON CONFLICT(provider, provider_subject) DO UPDATE SET
       user_id = excluded.user_id,
       last_login_at = excluded.last_login_at,
       updated_at = excluded.updated_at`
  ).run(createId('acct'), userId, providerSubject, now, now, now);
}

function upsertOidcAccount(userId: string, providerSubject: string) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO auth_accounts (id, user_id, provider, provider_subject, last_login_at, created_at, updated_at)
     VALUES (?, ?, 'dayu_oidc', ?, ?, ?, ?)
     ON CONFLICT(provider, provider_subject) DO UPDATE SET
       user_id = excluded.user_id,
       last_login_at = excluded.last_login_at,
       updated_at = excluded.updated_at`
  ).run(createId('acct'), userId, providerSubject, now, now, now);
}

function upsertOidcUser(claims: OidcIdTokenClaims, providerSubject: string) {
  const existingAccount = db
    .prepare('SELECT user_id FROM auth_accounts WHERE provider = ? AND provider_subject = ?')
    .get('dayu_oidc', providerSubject) as { user_id: string } | undefined;

  const displayName = pickFirstString(claims.name, claims.preferred_username, claims.email) ?? '大宇用户';
  const email = typeof claims.email === 'string' && claims.email.trim() ? claims.email.trim() : null;
  const userId = existingAccount?.user_id ?? createUser(displayName, email);

  updateUser(userId, displayName, email);
  upsertOidcAccount(userId, providerSubject);
  return userId;
}

function createUploadedAsset(userId: string, category: 'personal_reference' | 'style_reference', file: Express.Multer.File): AssetRow {
  const id = createId('asset');
  const extension = path.extname(file.originalname) || mimeToExtension(file.mimetype);
  const monthFolder = formatMonthPath();
  const fileName = `${id}${extension}`;
  const storagePath = path.join('uploads', category, monthFolder, fileName);
  const absolutePath = path.join(dataRoot, storagePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, file.buffer);

  db.prepare(
    `INSERT INTO file_assets (id, user_id, category, storage_disk, storage_path, public_url, file_name, mime_type, width, height, byte_size, created_at)
     VALUES (?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    category,
    storagePath,
    toStaticUrl(`/${storagePath.replaceAll(path.sep, '/')}`),
    file.originalname,
    file.mimetype || 'application/octet-stream',
    null,
    null,
    file.size,
    nowIso()
  );

  return getAsset(id)!;
}

function createGenerationTask(input: {
  userId: string;
  prompt: string;
  styleTags: string[];
  personalReferenceAssetId: string;
  styleReferenceAssetId: string | null;
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
      id, user_id, status, prompt, style_tags_json, personal_reference_asset_id, style_reference_asset_id,
      model, quality, size, output_format, progress_percent, progress_step, error_code, error_message,
      source_task_id, created_at, updated_at, completed_at
    ) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, 6, '排队中', NULL, NULL, ?, ?, ?, NULL)`
  ).run(
    id,
    input.userId,
    input.prompt,
    JSON.stringify(input.styleTags),
    input.personalReferenceAssetId,
    input.styleReferenceAssetId,
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

function ensureSeedTasks(userId: string) {
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM generation_tasks WHERE user_id = ?').get(userId) as { count: number };
  if (existingCount.count > 0) {
    return;
  }

  const personalAsset = createSeedAsset(userId, 'personal_reference', 'seed-personal.png', [236, 214, 210]);
  const styleAsset = createSeedAsset(userId, 'style_reference', 'seed-style.png', [206, 218, 240]);

  const completed = createGenerationTask({
    userId,
    prompt: '清透写真 艺术肖像 自然光',
    styleTags: ['清透写真', '艺术肖像', '自然光'],
    personalReferenceAssetId: personalAsset.id,
    styleReferenceAssetId: styleAsset.id,
    model: defaultImageModel,
    quality: defaultImageQuality,
    size: '1024x1536',
    outputFormat: 'png',
    sourceTaskId: null,
  });

  const failed = createGenerationTask({
    userId,
    prompt: '高级杂志 胶片质感',
    styleTags: ['高级杂志', '胶片质感'],
    personalReferenceAssetId: personalAsset.id,
    styleReferenceAssetId: styleAsset.id,
    model: defaultImageModel,
    quality: defaultImageQuality,
    size: '1024x1536',
    outputFormat: 'png',
    sourceTaskId: null,
  });

  const canceled = createGenerationTask({
    userId,
    prompt: '温柔奶油色 极简留白',
    styleTags: ['温柔奶油色', '极简留白'],
    personalReferenceAssetId: personalAsset.id,
    styleReferenceAssetId: styleAsset.id,
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
     error_code = 'GENERATION_FAILED', error_message = 'Mock 任务演示失败状态', created_at = ?, updated_at = ? WHERE id = ?`
  ).run(new Date(now - 1000 * 60 * 20).toISOString(), new Date(now - 1000 * 60 * 19).toISOString(), failed.id);

  db.prepare(
    `UPDATE generation_tasks SET status = 'canceled', progress_percent = 15, progress_step = '排队中',
     created_at = ?, updated_at = ? WHERE id = ?`
  ).run(new Date(now - 1000 * 60 * 10).toISOString(), new Date(now - 1000 * 60 * 9).toISOString(), canceled.id);
}

function createSeedAsset(userId: string, category: 'personal_reference' | 'style_reference', name: string, rgb: [number, number, number]) {
  const id = createId('asset');
  const monthFolder = formatMonthPath();
  const storagePath = path.join('uploads', category, monthFolder, `${id}.png`);
  const absolutePath = path.join(dataRoot, storagePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, createSolidPng(512, 512, rgb));
  db.prepare(
    `INSERT INTO file_assets (id, user_id, category, storage_disk, storage_path, public_url, file_name, mime_type, width, height, byte_size, created_at)
     VALUES (?, ?, ?, 'local', ?, ?, ?, 'image/png', 512, 512, ?, ?)`
  ).run(id, userId, category, storagePath, toStaticUrl(`/${storagePath.replaceAll(path.sep, '/')}`), name, fs.statSync(absolutePath).size, nowIso());
  return getAsset(id)!;
}

async function syncUserTasks(userId: string) {
  const activeTasks = db
    .prepare("SELECT id FROM generation_tasks WHERE user_id = ? AND status IN ('queued', 'processing')")
    .all(userId) as Array<{ id: string }>;

  for (const task of activeTasks) {
    await syncTask(task.id);
  }
}

async function syncAndGetOwnedTask(userId: string, taskId: string) {
  const owned = getOwnedTask(userId, taskId);
  if (!owned) {
    return null;
  }

  await syncTask(taskId);
  return getOwnedTask(userId, taskId);
}

async function syncTask(taskId: string) {
  const task = getTask(taskId);
  if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'canceled') {
    return task;
  }

  const elapsed = Date.now() - new Date(task.created_at).getTime();
  const checkpoints = [
    { max: 1600, status: 'queued' as const, percent: 8, step: '排队中' },
    { max: 3600, status: 'processing' as const, percent: 24, step: '分析个人形象' },
    { max: 5600, status: 'processing' as const, percent: 48, step: '提取风格氛围' },
    { max: 7600, status: 'processing' as const, percent: 72, step: '生成头像构图' },
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

function finalizeMockTask(taskId: string) {
  db.prepare(
    "UPDATE generation_tasks SET status = 'completed', progress_percent = 100, progress_step = '生成完成', updated_at = ?, completed_at = ? WHERE id = ?"
  ).run(nowIso(), nowIso(), taskId);
  ensureMockGenerationResult(taskId);
}

function ensureMockGenerationResult(taskId: string) {
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
  const thumbAsset = createMockGeneratedAsset(task.user_id, task.id, 'generated_thumbnail', Math.floor(width / 2), Math.floor(height / 2), task.prompt, true);
  const resultId = createId('res');

  db.prepare(
    'INSERT INTO generation_results (id, task_id, image_asset_id, thumbnail_asset_id, saved_to_gallery, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(resultId, taskId, imageAsset.id, thumbAsset.id, nowIso());

  return getResultByTaskId(taskId);
}

function ensureOpenAiGenerationStarted(taskId: string) {
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

async function runOpenAiGeneration(taskId: string) {
  const latestTask = getTask(taskId);
  if (!latestTask || latestTask.status === 'completed' || latestTask.status === 'failed' || latestTask.status === 'canceled') {
    return;
  }

  if (getResultByTaskId(taskId)) {
    db.prepare(
      "UPDATE generation_tasks SET status = 'completed', progress_percent = 100, progress_step = '生成完成', updated_at = ?, completed_at = ? WHERE id = ?"
    ).run(nowIso(), nowIso(), taskId);
    return;
  }

  try {
    const generated = await generateOpenAiImage(latestTask);
    persistGeneratedResult(latestTask, generated);
    db.prepare(
      "UPDATE generation_tasks SET status = 'completed', progress_percent = 100, progress_step = '生成完成', error_code = NULL, error_message = NULL, updated_at = ?, completed_at = ? WHERE id = ?"
    ).run(nowIso(), nowIso(), taskId);
  } catch (error) {
    const failure = normalizeOpenAiGenerationFailure(error);
    logOpenAiGenerationFailure(latestTask, failure);
    db.prepare(
      "UPDATE generation_tasks SET status = 'failed', progress_percent = 96, progress_step = '高清细化中', error_code = 'GENERATION_FAILED', error_message = ?, updated_at = ? WHERE id = ?"
    ).run(failure.taskMessage, nowIso(), taskId);
  }
}

async function generateOpenAiImage(task: TaskRow): Promise<GeneratedImagePayload> {
  ensureOpenAiConfigured();
  const requestUrl = buildOpenAiImagesUrl(openAiBaseUrl);
  const [width, height] = parseSize(task.size);
  const outputFormat = normalizeOutputFormat(task.output_format);
  const requestBodies = buildOpenAiRequestBodies(task, outputFormat);

  for (const body of requestBodies) {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });

    const payload = await readOpenAiResponse(response);

    if (!response.ok) {
      if (response.status === 400 && body !== requestBodies[requestBodies.length - 1]) {
        continue;
      }
      throw extractOpenAiFailureFromResponse(response.status, payload);
    }

    const first = Array.isArray(payload.data) ? payload.data[0] : null;
    if (!first || typeof first !== 'object') {
      throw createOpenAiGenerationFailure({
        status: response.status,
        providerCode: payload.error?.code ?? null,
        providerType: payload.error?.type ?? null,
        providerMessage: payload.error?.message ?? 'No image data returned',
        internalCode: 'OPENAI_INVALID_RESPONSE',
        taskMessage: '生成服务返回了无法识别的图片结果。',
      });
    }

    if (typeof first.b64_json === 'string') {
      if (!first.b64_json) {
        throw createOpenAiGenerationFailure({
          status: response.status,
          providerCode: payload.error?.code ?? null,
          providerType: payload.error?.type ?? null,
          providerMessage: 'Image response contained empty b64_json data',
          internalCode: 'OPENAI_INVALID_RESPONSE',
          taskMessage: '生成服务返回了空的图片数据。',
        });
      }

      const buffer = Buffer.from(first.b64_json, 'base64');
      if (buffer.byteLength === 0) {
        throw createOpenAiGenerationFailure({
          status: response.status,
          providerCode: payload.error?.code ?? null,
          providerType: payload.error?.type ?? null,
          providerMessage: 'Image response contained empty b64_json data',
          internalCode: 'OPENAI_INVALID_RESPONSE',
          taskMessage: '生成服务返回了空的图片数据。',
        });
      }

      const file = detectImageFile(buffer);
      if (!file) {
        throw createOpenAiGenerationFailure({
          status: response.status,
          providerCode: payload.error?.code ?? null,
          providerType: payload.error?.type ?? null,
          providerMessage: 'Image response b64_json format could not be detected',
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
    }

    if (typeof first.url === 'string' && first.url) {
      return downloadOpenAiImage(first.url, response.status, width, height);
    }

    throw createOpenAiGenerationFailure({
      status: response.status,
      providerCode: payload.error?.code ?? null,
      providerType: payload.error?.type ?? null,
      providerMessage: 'Image response did not include b64_json or url',
      internalCode: 'OPENAI_INVALID_RESPONSE',
      taskMessage: '生成服务返回了无法识别的图片结果。',
    });
  }

  throw createOpenAiGenerationFailure({
    status: 400,
    providerCode: null,
    providerType: null,
    providerMessage: 'All OpenAI request variants were rejected with HTTP 400',
    internalCode: 'OPENAI_BAD_REQUEST',
    taskMessage: '生成请求被服务拒绝，请检查模型或参数配置。',
  });
}

function buildOpenAiRequestBodies(task: TaskRow, outputFormat: 'png' | 'jpeg' | 'webp') {
  const baseBody = {
    model: task.model || defaultImageModel,
    prompt: buildGenerationPrompt(task),
    n: 1,
    quality: task.quality || defaultImageQuality,
    size: normalizeOpenAiSize(task.size),
  };

  return [
    {
      ...baseBody,
      output_format: outputFormat,
      response_format: 'b64_json',
    },
    {
      ...baseBody,
      output_format: outputFormat,
    },
    baseBody,
  ];
}

function buildOpenAiImagesUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, '');

  if (normalizedPath.endsWith('/v1/images/generations')) {
    return url.toString();
  }

  if (normalizedPath.endsWith('/v1')) {
    url.pathname = `${normalizedPath}/images/generations`;
    return url.toString();
  }

  url.pathname = `${normalizedPath}/v1/images/generations`.replace(/\/+/g, '/');
  return url.toString();
}

function persistGeneratedResult(task: TaskRow, image: GeneratedImagePayload) {
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
  const thumbAsset = createBinaryGeneratedAsset({
    userId: task.user_id,
    taskId: task.id,
    category: 'generated_thumbnail',
    buffer: image.buffer,
    mimeType: image.mimeType,
    extension: image.extension,
    width: image.width,
    height: image.height,
    fileNameSuffix: 'thumb',
  });
  const resultId = createId('res');

  db.prepare(
    'INSERT INTO generation_results (id, task_id, image_asset_id, thumbnail_asset_id, saved_to_gallery, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(resultId, task.id, imageAsset.id, thumbAsset.id, nowIso());

  return getResultByTaskId(task.id);
}

function createMockGeneratedAsset(
  userId: string,
  taskId: string,
  category: 'generated_result' | 'generated_thumbnail',
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

function createBinaryGeneratedAsset(input: {
  userId: string;
  taskId: string;
  category: 'generated_result' | 'generated_thumbnail';
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  fileNameSuffix: 'result' | 'thumb';
}) {
  const id = createId('asset');
  const monthFolder = formatMonthPath();
  const fileName = `${input.taskId}-${input.fileNameSuffix}${input.extension}`;
  const storagePath = path.join('generated', monthFolder, input.taskId, fileName);
  const absolutePath = path.join(dataRoot, storagePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, input.buffer);

  db.prepare(
    `INSERT INTO file_assets (id, user_id, category, storage_disk, storage_path, public_url, file_name, mime_type, width, height, byte_size, created_at)
     VALUES (?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.category,
    storagePath,
    toStaticUrl(`/${storagePath.replaceAll(path.sep, '/')}`),
    fileName,
    input.mimeType,
    input.width,
    input.height,
    input.buffer.byteLength,
    nowIso()
  );

  return getAsset(id)!;
}

function mapUser(user: UserRow) {
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

function mapAsset(asset: AssetRow) {
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

function mapTask(task: TaskRow, withResult = false) {
  const result = withResult ? getResultByTaskId(task.id) : null;
  return {
    id: task.id,
    status: task.status,
    prompt: task.prompt,
    styleTags: JSON.parse(task.style_tags_json) as string[],
    personalReferenceAssetId: task.personal_reference_asset_id,
    styleReferenceAssetId: task.style_reference_asset_id,
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

function mapResult(result: ResultRow) {
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

function mapGalleryItem(itemId: string) {
  const row = db
    .prepare(
      `SELECT g.*, r.task_id, image_asset.public_url as image_url, thumb_asset.public_url as thumbnail_url
       FROM gallery_items g
       JOIN generation_results r ON r.id = g.generation_result_id
       JOIN file_assets image_asset ON image_asset.id = r.image_asset_id
       LEFT JOIN file_assets thumb_asset ON thumb_asset.id = r.thumbnail_asset_id
       WHERE g.id = ?`
    )
    .get(itemId) as (GalleryRow & { task_id: string; image_url: string; thumbnail_url: string | null }) | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    generationResultId: row.generation_result_id,
    taskId: row.task_id,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url,
    isFavorited: Boolean(row.is_favorited),
    savedAt: row.saved_at,
  };
}

function mapSessionSummary(sessionId: string, sessionData: session.SessionData) {
  const sessionRow = getSession(sessionId);
  return {
    id: sessionId,
    expiresAt: sessionRow?.expires_at ?? getSessionExpiry(sessionData),
    authMode: (sessionData.authMode ?? 'mock') as AuthMode,
  };
}

function taskProgressMessage(task: TaskRow) {
  if (task.status === 'completed') {
    return generationMode === 'mock' ? 'Mock generation complete' : 'Avatar generation complete';
  }
  if (task.status === 'failed') {
    return 'Avatar generation failed';
  }
  return generationMode === 'mock' ? 'Mock generation in progress' : 'Avatar generation in progress';
}

function getUser(userId: string) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
}

function getSession(sessionId: string) {
  return db.prepare('SELECT id, user_id, auth_mode, expires_at FROM sessions WHERE id = ?').get(sessionId) as SessionRow | undefined;
}

function getAsset(assetId: string) {
  return db.prepare('SELECT * FROM file_assets WHERE id = ?').get(assetId) as AssetRow | undefined;
}

function getOwnedAsset(userId: string, assetId: string) {
  return db.prepare('SELECT * FROM file_assets WHERE id = ? AND user_id = ?').get(assetId, userId) as AssetRow | undefined;
}

function getTask(taskId: string) {
  return db.prepare('SELECT * FROM generation_tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
}

function getOwnedTask(userId: string, taskId: string) {
  return db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as TaskRow | undefined;
}

function getResultByTaskId(taskId: string) {
  return db.prepare('SELECT * FROM generation_results WHERE task_id = ?').get(taskId) as ResultRow | undefined;
}

async function getOidcDiscovery() {
  ensureOidcConfigured();
  if (!oidcDiscoveryPromise) {
    oidcDiscoveryPromise = (async () => {
      const response = await fetch(oidcDiscoveryUrl, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        throw new Error('oidc_discovery_failed');
      }

      const payload = (await response.json()) as Partial<OidcDiscoveryDocument>;
      if (!payload.issuer || !payload.authorization_endpoint || !payload.token_endpoint || !payload.jwks_uri) {
        throw new Error('oidc_discovery_incomplete');
      }

      if (oidcJwksUri && oidcJwksUri !== payload.jwks_uri) {
        oidcJwksPromise = null;
      }
      oidcJwksUri = payload.jwks_uri;

      return {
        issuer: payload.issuer,
        authorization_endpoint: payload.authorization_endpoint,
        token_endpoint: payload.token_endpoint,
        jwks_uri: payload.jwks_uri,
        end_session_endpoint: payload.end_session_endpoint,
        id_token_signing_alg_values_supported: Array.isArray(payload.id_token_signing_alg_values_supported)
          ? payload.id_token_signing_alg_values_supported
          : undefined,
      };
    })().catch((error: unknown) => {
      oidcDiscoveryPromise = null;
      throw error;
    });
  }

  return oidcDiscoveryPromise;
}

async function getOidcJwks(discovery: OidcDiscoveryDocument) {
  if (!discovery.jwks_uri) {
    throw new Error('oidc_jwks_missing');
  }

  if (oidcJwksUri !== discovery.jwks_uri) {
    oidcJwksPromise = null;
    oidcJwksUri = discovery.jwks_uri;
  }

  if (!oidcJwksPromise) {
    oidcJwksPromise = (async () => {
      const response = await fetch(discovery.jwks_uri!, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        throw new Error('oidc_jwks_fetch_failed');
      }

      const payload = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(payload.keys)) {
        throw new Error('oidc_jwks_invalid');
      }

      return payload.keys.filter(isOidcJwk);
    })().catch((error: unknown) => {
      oidcJwksPromise = null;
      throw error;
    });
  }

  return oidcJwksPromise;
}

async function getOidcEndSessionEndpoint() {
  if (authMode !== 'oidc' || !oidcDiscoveryUrl) {
    return null;
  }

  try {
    const discovery = await getOidcDiscovery();
    return discovery.end_session_endpoint ?? null;
  } catch {
    return null;
  }
}

async function exchangeOidcCode(discovery: OidcDiscoveryDocument, code: string, codeVerifier: string) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: oidcRedirectUri,
    client_id: oidcClientId,
    code_verifier: codeVerifier,
  });

  if (oidcClientSecret) {
    body.set('client_secret', oidcClientSecret);
  }

  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error('oidc_token_exchange_failed');
  }

  return (await response.json()) as OidcTokenResponse;
}

async function verifyOidcIdToken(idToken: string, discovery: OidcDiscoveryDocument, expectedNonce: string) {
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('invalid_id_token');
  }

  const header = parseJwtPart<OidcJwtHeader>(parts[0]);
  const claims = parseJwtPart<OidcIdTokenClaims>(parts[1]);

  const alg = typeof header.alg === 'string' ? header.alg : '';
  if (!isSupportedOidcSigningAlg(alg)) {
    throw new Error('unsupported_id_token_alg');
  }

  const advertisedAlgs = discovery.id_token_signing_alg_values_supported;
  if (advertisedAlgs && advertisedAlgs.length > 0 && !advertisedAlgs.includes(alg)) {
    throw new Error('unadvertised_id_token_alg');
  }

  const kid = typeof header.kid === 'string' ? header.kid : null;
  const jwks = await getOidcJwks(discovery);
  const key = findSigningJwk(jwks, alg, kid);
  if (!key) {
    throw new Error('id_token_key_not_found');
  }

  const publicKey = crypto.createPublicKey({ key, format: 'jwk' });
  const verifyAlg = alg === 'RS256' ? 'RSA-SHA256' : 'SHA256';
  const signature = alg === 'ES256' ? joseToDerSignature(Buffer.from(parts[2], 'base64url'), 32) : Buffer.from(parts[2], 'base64url');
  const verified = crypto.verify(verifyAlg, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, signature);

  if (!verified) {
    throw new Error('id_token_signature_invalid');
  }

  validateOidcIdTokenClaims(claims, discovery, expectedNonce);
  return claims;
}

function validateOidcIdTokenClaims(claims: OidcIdTokenClaims, discovery: OidcDiscoveryDocument, expectedNonce: string) {
  const issuer = typeof claims.iss === 'string' ? claims.iss : '';
  if (discovery.issuer && issuer !== discovery.issuer) {
    throw new Error('invalid_issuer');
  }

  if (!matchesOidcAudience(claims.aud, oidcClientId)) {
    throw new Error('invalid_audience');
  }

  if (Array.isArray(claims.aud) && claims.aud.length > 1) {
    if (typeof claims.azp !== 'string' || claims.azp !== oidcClientId) {
      throw new Error('invalid_authorized_party');
    }
  }

  if (typeof claims.sub !== 'string' || !claims.sub.trim()) {
    throw new Error('missing_sub');
  }

  if (typeof claims.nonce !== 'string' || claims.nonce !== expectedNonce) {
    throw new Error('invalid_nonce');
  }

  const now = Math.floor(Date.now() / 1000);
  const clockSkewSeconds = 60;
  if (typeof claims.exp !== 'number' || claims.exp <= now - clockSkewSeconds) {
    throw new Error('id_token_expired');
  }

  if (typeof claims.iat !== 'number') {
    throw new Error('invalid_iat');
  }

  if (claims.iat > now + clockSkewSeconds) {
    throw new Error('invalid_iat');
  }

  if (claims.iat > claims.exp) {
    throw new Error('invalid_iat');
  }
}

function parseJwtPart<T>(value: string) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
}

function isSupportedOidcSigningAlg(alg: string) {
  return alg === 'RS256' || alg === 'ES256';
}

function findSigningJwk(jwks: OidcJwk[], alg: 'RS256' | 'ES256', kid: string | null) {
  const matchingKeys = jwks.filter((key) => {
    if (kid && key.kid !== kid) {
      return false;
    }
    if (key.use && key.use !== 'sig') {
      return false;
    }
    if (key.alg && key.alg !== alg) {
      return false;
    }
    return alg === 'RS256' ? key.kty === 'RSA' : key.kty === 'EC' && key.crv === 'P-256';
  });

  if (!kid && matchingKeys.length !== 1) {
    return null;
  }

  return matchingKeys[0] ?? null;
}

function isOidcJwk(value: unknown): value is OidcJwk {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const key = value as Partial<OidcJwk>;
  return key.kty === 'RSA' || key.kty === 'EC';
}

function joseToDerSignature(signature: Buffer, partLength: number) {
  if (signature.length !== partLength * 2) {
    throw new Error('invalid_es256_signature');
  }

  const r = signatureIntegerToDer(signature.subarray(0, partLength));
  const s = signatureIntegerToDer(signature.subarray(partLength));
  const length = r.length + s.length;

  if (length >= 128) {
    return Buffer.concat([Buffer.from([0x30, 0x81, length]), r, s]);
  }

  return Buffer.concat([Buffer.from([0x30, length]), r, s]);
}

function signatureIntegerToDer(value: Buffer) {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) {
    start += 1;
  }

  let normalized = value.subarray(start);
  if (normalized[0] & 0x80) {
    normalized = Buffer.concat([Buffer.from([0]), normalized]);
  }

  return Buffer.concat([Buffer.from([0x02, normalized.length]), normalized]);
}

function matchesOidcAudience(audience: unknown, clientId: string) {
  if (typeof audience === 'string') {
    return audience === clientId;
  }
  if (Array.isArray(audience)) {
    return audience.includes(clientId);
  }
  return false;
}

function ensureOidcConfigured() {
  if (!oidcDiscoveryUrl || !oidcClientId || !oidcRedirectUri) {
    throw new Error('oidc_config_missing');
  }
}

function ensureOpenAiConfigured() {
  if (!openAiApiKey) {
    throw createOpenAiGenerationFailure({
      status: null,
      providerCode: null,
      providerType: null,
      providerMessage: null,
      internalCode: 'OPENAI_CONFIG_MISSING_API_KEY',
      taskMessage: '生成服务配置不完整，请检查 OPENAI_API_KEY。',
    });
  }

  if (!openAiBaseUrl) {
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

function createPkceChallenge(verifier: string) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function randomUrlSafeToken(bytes: number) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeOpenAiBaseUrl(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return '';
  }
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function buildGenerationPrompt(task: TaskRow) {
  return task.prompt.trim() || '清透苹果系艺术头像，自然光，画廊感';
}

function normalizeOpenAiSize(size: string) {
  const [width, height] = parseSize(size);
  return `${width}x${height}`;
}

function detectImageFile(buffer: Buffer) {
  if (isPng(buffer)) {
    return { mimeType: 'image/png', extension: '.png' };
  }
  if (isJpeg(buffer)) {
    return { mimeType: 'image/jpeg', extension: '.jpg' };
  }
  if (isWebp(buffer)) {
    return { mimeType: 'image/webp', extension: '.webp' };
  }

  return null;
}

function normalizeOutputFormat(format: string): 'png' | 'jpeg' | 'webp' {
  if (format === 'jpeg' || format === 'jpg') {
    return 'jpeg';
  }
  if (format === 'webp') {
    return 'webp';
  }
  return 'png';
}

async function readOpenAiResponse(response: globalThis.Response): Promise<OpenAiImagesResponse> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as OpenAiImagesResponse;
  } catch {
    throw createOpenAiGenerationFailure({
      status: response.status,
      providerCode: null,
      providerType: null,
      providerMessage: `Non-JSON response: ${truncateForLog(text, 240)}`,
      internalCode: 'OPENAI_INVALID_JSON',
      taskMessage: '生成服务返回了无法解析的响应。',
    });
  }
}

function extractOpenAiFailureFromResponse(status: number, body: OpenAiImagesResponse) {
  const providerCode = body.error?.code ?? null;
  const providerType = body.error?.type ?? null;
  const providerMessage = body.error?.message ?? null;

  return createOpenAiGenerationFailure({
    status,
    providerCode,
    providerType,
    providerMessage,
    internalCode: inferOpenAiInternalCode(status, providerCode, providerType),
    taskMessage: buildTaskFailureMessage(status, providerCode, providerType, providerMessage),
  });
}

async function downloadOpenAiImage(imageUrl: string, status: number, width: number, height: number): Promise<GeneratedImagePayload> {
  const safeUrl = sanitizeLoggedUrl(imageUrl);
  let imageResponse: globalThis.Response;

  try {
    imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(90_000) });
  } catch {
    throw createOpenAiGenerationFailure({
      status,
      providerCode: null,
      providerType: null,
      providerMessage: `Image download failed from ${safeUrl}`,
      internalCode: 'OPENAI_INVALID_RESPONSE',
      taskMessage: '生成服务返回了无效的图片结果，请稍后重试。',
    });
  }

  if (!imageResponse.ok) {
    throw createOpenAiGenerationFailure({
      status: imageResponse.status,
      providerCode: null,
      providerType: null,
      providerMessage: `Image download returned HTTP ${imageResponse.status} from ${safeUrl}`,
      internalCode: 'OPENAI_INVALID_RESPONSE',
      taskMessage: '生成服务返回了无效的图片结果，请稍后重试。',
    });
  }

  const contentType = imageResponse.headers.get('content-type') ?? '';
  if (contentType && !contentType.startsWith('image/')) {
    throw createOpenAiGenerationFailure({
      status: imageResponse.status,
      providerCode: null,
      providerType: null,
      providerMessage: `Image download returned non-image content-type ${truncateForLog(contentType, 80)} from ${safeUrl}`,
      internalCode: 'OPENAI_INVALID_RESPONSE',
      taskMessage: '生成服务返回了非图片结果，请稍后重试。',
    });
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw createOpenAiGenerationFailure({
      status: imageResponse.status,
      providerCode: null,
      providerType: null,
      providerMessage: `Image download returned empty body from ${safeUrl}`,
      internalCode: 'OPENAI_INVALID_RESPONSE',
      taskMessage: '生成服务返回了空的图片结果，请稍后重试。',
    });
  }

  const file = detectImageFile(buffer);
  if (!file) {
    throw createOpenAiGenerationFailure({
      status: imageResponse.status,
      providerCode: null,
      providerType: null,
      providerMessage: `Image download returned undetectable binary payload from ${safeUrl}`,
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
}

function createOpenAiGenerationFailure(failure: OpenAiGenerationFailure) {
  const error = new Error(failure.taskMessage) as Error & { details?: OpenAiGenerationFailure };
  error.details = failure;
  return error;
}

function normalizeOpenAiGenerationFailure(error: unknown): OpenAiGenerationFailure {
  if (error instanceof Error && 'details' in error) {
    const details = (error as Error & { details?: OpenAiGenerationFailure }).details;
    if (details) {
      return details;
    }
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
function logOpenAiGenerationFailure(task: TaskRow, failure: OpenAiGenerationFailure) {
  console.warn('[openai-generation] task failed', {
    taskId: task.id,
    status: failure.status,
    providerCode: failure.providerCode,
    providerType: failure.providerType,
    providerMessage: failure.providerMessage ? sanitizeTaskErrorDetail(failure.providerMessage) : null,
    internalCode: failure.internalCode,
  });
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

function buildTaskFailureMessage(
  status: number,
  providerCode: string | null,
  providerType: string | null,
  providerMessage: string | null
) {
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

function isPng(buffer: Buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpeg(buffer: Buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isWebp(buffer: Buffer) {
  return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

function createGradientPng(width: number, height: number, seed: string, thumbnail: boolean) {
  const png = new PNG({ width, height });
  const hash = crypto.createHash('sha256').update(seed).digest();
  const top = [255, 248 - (hash[0] % 20), 244 - (hash[1] % 16)];
  const bottom = [224 - (hash[2] % 24), 230 - (hash[3] % 20), 248 - (hash[4] % 14)];
  const accent = [209 + (hash[5] % 24), 196 + (hash[6] % 28), 173 + (hash[7] % 24)];

  for (let y = 0; y < height; y += 1) {
    const t = y / Math.max(height - 1, 1);
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) << 2;
      const wave = Math.sin((x / width) * Math.PI * 4 + t * Math.PI) * 10;
      png.data[idx] = clamp(mix(top[0], bottom[0], t) + wave);
      png.data[idx + 1] = clamp(mix(top[1], bottom[1], t) + wave / 2);
      png.data[idx + 2] = clamp(mix(top[2], bottom[2], t));
      png.data[idx + 3] = 255;

      const cx = width * 0.72;
      const cy = height * 0.28;
      const rx = thumbnail ? width * 0.18 : width * 0.22;
      const ry = thumbnail ? height * 0.11 : height * 0.13;
      const ellipse = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
      if (ellipse < 1) {
        png.data[idx] = clamp((png.data[idx] + accent[0]) / 2);
        png.data[idx + 1] = clamp((png.data[idx + 1] + accent[1]) / 2);
        png.data[idx + 2] = clamp((png.data[idx + 2] + accent[2]) / 2);
      }
    }
  }

  return PNG.sync.write(png);
}

function createSolidPng(width: number, height: number, rgb: [number, number, number]) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) << 2;
      png.data[idx] = rgb[0];
      png.data[idx + 1] = rgb[1];
      png.data[idx + 2] = rgb[2];
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function parseSize(size: string) {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    return [1024, 1536] as const;
  }
  return [Number(match[1]), Number(match[2])] as const;
}

function getSessionExpiry(sessionData: session.SessionData) {
  const expires = sessionData.cookie?.expires;
  if (!expires) {
    return new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  }
  return new Date(expires).toISOString();
}

function getRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

function mimeToExtension(mimeType: string) {
  if (mimeType === 'image/png') {
    return '.png';
  }
  if (mimeType === 'image/webp') {
    return '.webp';
  }
  if (mimeType === 'image/jpeg') {
    return '.jpg';
  }
  return '.bin';
}

function toStaticUrl(relativeUrl: string) {
  return `/static${relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`}`;
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function formatMonthPath() {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function mix(from: number, to: number, ratio: number) {
  return from + (to - from) * ratio;
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseMode<T extends string>(value: string | undefined, validValues: readonly T[], fallback: T): T {
  if (value && validValues.includes(value as T)) {
    return value as T;
  }
  return fallback;
}

function buildFrontendUrl(pathname: string) {
  return new URL(pathname, webOrigin).toString();
}

function redirectToLoginError(res: Response, message: string) {
  const loginUrl = new URL('/login', webOrigin);
  loginUrl.searchParams.set('error', message);
  res.redirect(loginUrl.toString());
}

function saveSession(sessionData: session.Session & Partial<session.SessionData>) {
  return new Promise<void>((resolve, reject) => {
    sessionData.save((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function destroySession(req: Request) {
  return new Promise<void>((resolve) => {
    req.session.destroy(() => {
      resolve();
    });
  });
}

function isValidationLikeError(error: unknown) {
  return error instanceof SyntaxError;
}
