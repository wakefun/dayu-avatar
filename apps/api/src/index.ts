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
  summary: string | null;
  personal_reference_asset_id: string;
  style_reference_asset_id: string | null;
  personal_reference_asset_ids_json: string | null;
  style_reference_asset_ids_json: string | null;
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

type OidcSigningAlg = 'RS256' | 'ES256' | 'ES384';

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

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: OpenAiErrorPayload;
};

type OpenAiEditRequestVariant = {
  files: Array<{
    buffer: Buffer;
    mimeType: string;
    fileName: string;
  }>;
  fields: Record<string, string>;
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

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '../..');
loadEnvFile(path.join(repoRoot, '.env'));

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
const defaultPromptModel = process.env.OPENAI_PROMPT_MODEL?.trim() || 'gpt-5.5';
const defaultImageQuality = process.env.OPENAI_IMAGE_QUALITY?.trim() || 'high';
const defaultOpenAiRequestTimeoutMs = 600_000;
const openAiRequestTimeoutMs = parseOptionalPositiveIntegerEnv(process.env.OPENAI_REQUEST_TIMEOUT_MS, defaultOpenAiRequestTimeoutMs);
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

app.post('/api/generation-tasks', requireAuth, async (req, res, next) => {
  try {
    const personalReferenceAssetIds = normalizeAssetIdList(req.body?.personalReferenceAssetIds, req.body?.personalReferenceAssetId, 3);
    const styleReferenceAssetIds = normalizeAssetIdList(req.body?.styleReferenceAssetIds, req.body?.styleReferenceAssetId ?? null, 3);
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const styleTags = Array.isArray(req.body?.styleTags)
      ? req.body.styleTags.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const requestedQuantity = Number(req.body?.quantity ?? 1);
    const quantity = Number.isFinite(requestedQuantity) ? Math.max(1, Math.min(8, Math.floor(requestedQuantity))) : 1;
    const generationParams = req.body?.generationParams ?? {};

    if (personalReferenceAssetIds.length === 0) {
      sendError(res, 400, 'VALIDATION_ERROR', 'personalReferenceAssetIds is required');
      return;
    }

    for (const assetId of personalReferenceAssetIds) {
      const personalAsset = getOwnedAsset(req.session.userId!, assetId);
      if (!personalAsset || personalAsset.category !== 'personal_reference') {
        sendError(res, 400, 'VALIDATION_ERROR', 'personal reference asset is invalid');
        return;
      }
    }

    for (const assetId of styleReferenceAssetIds) {
      const styleAsset = getOwnedAsset(req.session.userId!, assetId);
      if (!styleAsset || styleAsset.category !== 'style_reference') {
        sendError(res, 400, 'VALIDATION_ERROR', 'style reference asset is invalid');
        return;
      }
    }

    const model = typeof generationParams.model === 'string' ? generationParams.model : defaultImageModel;
    const quality = typeof generationParams.quality === 'string' ? generationParams.quality : defaultImageQuality;
    const size = normalizeOpenAiSize(typeof generationParams.size === 'string' ? generationParams.size : '1024x1536');
    const outputFormat = typeof generationParams.outputFormat === 'string' ? generationParams.outputFormat : 'png';
    const summary = await createTaskSummary({
      prompt,
      styleTags,
      personalReferenceCount: personalReferenceAssetIds.length,
      styleReferenceCount: styleReferenceAssetIds.length,
      model,
      quality,
      size,
    });

    const tasks = Array.from({ length: quantity }, () =>
      createGenerationTask({
        userId: req.session.userId!,
        prompt,
        styleTags,
        summary,
        personalReferenceAssetId: personalReferenceAssetIds[0]!,
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

  const personalReferenceAssetIds = getTaskReferenceAssetIds(sourceTask, 'personal');
  const styleReferenceAssetIds = getTaskReferenceAssetIds(sourceTask, 'style');
  const task = createGenerationTask({
    userId: sourceTask.user_id,
    prompt: sourceTask.prompt,
    styleTags: parseStoredStyleTags(sourceTask.style_tags_json),
    summary: sourceTask.summary ?? buildFallbackTaskSummary({
      prompt: sourceTask.prompt,
      styleTags: parseStoredStyleTags(sourceTask.style_tags_json),
      personalReferenceCount: personalReferenceAssetIds.length,
      styleReferenceCount: styleReferenceAssetIds.length,
      size: sourceTask.size,
    }),
    personalReferenceAssetId: personalReferenceAssetIds[0]!,
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
        summary: getTaskSummary(task),
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
        promptSummary: getTaskSummary(task),
        prompt: task.prompt,
        styleTags: parseStoredStyleTags(task.style_tags_json),
        personalReferenceAssets: getTaskReferenceAssets(task, 'personal'),
        styleReferenceAssets: getTaskReferenceAssets(task, 'style'),
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
      `SELECT g.*, r.task_id, image_asset.public_url as image_url, image_asset.width as image_width, image_asset.height as image_height,
              thumb_asset.public_url as thumbnail_url
       FROM gallery_items g
       JOIN generation_results r ON r.id = g.generation_result_id
       JOIN file_assets image_asset ON image_asset.id = r.image_asset_id
       LEFT JOIN file_assets thumb_asset ON thumb_asset.id = r.thumbnail_asset_id
       WHERE g.user_id = ?
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

app.post('/api/users/me/avatar', requireAuth, (req, res) => {
  const galleryItemId = typeof req.body?.galleryItemId === 'string' ? req.body.galleryItemId : '';
  const row = db
    .prepare(
      `SELECT image_asset.id as asset_id
       FROM gallery_items g
       JOIN generation_results r ON r.id = g.generation_result_id
       JOIN file_assets image_asset ON image_asset.id = r.image_asset_id
       WHERE g.id = ? AND g.user_id = ?`
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
      summary TEXT,
      personal_reference_asset_id TEXT NOT NULL,
      style_reference_asset_id TEXT,
      personal_reference_asset_ids_json TEXT,
      style_reference_asset_ids_json TEXT,
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
  ensureColumn('generation_tasks', 'summary', 'TEXT');
  ensureColumn('generation_tasks', 'personal_reference_asset_ids_json', 'TEXT');
  ensureColumn('generation_tasks', 'style_reference_asset_ids_json', 'TEXT');
}

function ensureColumn(tableName: string, columnName: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
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

function normalizeAssetIdList(value: unknown, fallback: unknown, maxCount: number) {
  const rawValues = Array.isArray(value) ? value : typeof fallback === 'string' ? [fallback] : [];
  return rawValues.filter((assetId): assetId is string => typeof assetId === 'string' && assetId.trim().length > 0).slice(0, maxCount);
}

async function createTaskSummary(input: {
  prompt: string;
  styleTags: string[];
  personalReferenceCount: number;
  styleReferenceCount: number;
  model: string;
  quality: string;
  size: string;
}) {
  const fallback = buildFallbackTaskSummary(input);
  if (!openAiApiKey || !openAiBaseUrl) {
    return fallback;
  }

  try {
    const response = await fetch(buildOpenAiChatCompletionsUrl(openAiBaseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: defaultPromptModel,
        messages: [
          {
            role: 'system',
            content: 'Return one short Chinese description for an avatar generation task. Use 6 to 16 Chinese characters. No markdown, punctuation, quotes, or explanation.',
          },
          {
            role: 'user',
            content: [
              `User prompt: ${input.prompt || '未填写'}`,
              `Style tags: ${input.styleTags.length > 0 ? input.styleTags.join(' / ') : '无'}`,
              `Personal reference images: ${input.personalReferenceCount}`,
              `Style reference images: ${input.styleReferenceCount}`,
              `Output size: ${input.size}`,
            ].join('\n'),
          },
        ],
      }),
      signal: AbortSignal.timeout(Math.min(openAiRequestTimeoutMs, 20_000)),
    });

    const payload = await readOpenAiChatResponse(response);
    if (!response.ok) {
      return fallback;
    }

    return normalizeTaskSummary(extractPromptText(payload)) || fallback;
  } catch {
    return fallback;
  }
}

function buildFallbackTaskSummary(input: { prompt: string; styleTags: string[]; personalReferenceCount: number; styleReferenceCount: number; size: string }) {
  const source = input.styleTags.length > 0 ? input.styleTags.join('') : input.prompt.trim();
  const normalized = normalizeTaskSummary(source);
  if (normalized) {
    return normalized;
  }

  const referenceCopy = input.styleReferenceCount > 0 ? '含风格参考' : '个人头像生成';
  return normalizeTaskSummary(`${referenceCopy}${input.size}`) || '个人头像生成';
}

function normalizeTaskSummary(value: string) {
  return value
    .replace(/["'`“”‘’]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[。；;,.，、]+$/g, '')
    .slice(0, 18);
}


function createGenerationTask(input: {
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

function ensureSeedTasks(userId: string) {
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
    summary: '高级杂志胶片头像',
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
    summary: '温柔奶油色极简头像',
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

function startGenerationRun(taskId: string) {
  if (generationMode === 'openai') {
    return ensureOpenAiGenerationStarted(taskId);
  }
  return Promise.resolve(syncTask(taskId)).then(() => undefined);
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
  const enhancedPrompt = await generateEnhancedOpenAiPrompt(task);
  const requestVariants = buildOpenAiEditRequestVariants(task, enhancedPrompt);

  for (const variant of requestVariants) {
    const formData = new FormData();
    for (const file of variant.files) {
      formData.append('image', new Blob([toArrayBuffer(file.buffer)], { type: file.mimeType }), file.fileName);
    }
    for (const [key, value] of Object.entries(variant.fields)) {
      formData.append(key, value);
    }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(openAiRequestTimeoutMs),
    });

    const payload = await readOpenAiResponse(response);

    if (!response.ok) {
      if (response.status === 400 && variant !== requestVariants[requestVariants.length - 1]) {
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

function buildOpenAiEditRequestVariants(task: TaskRow, enhancedPrompt: string): OpenAiEditRequestVariant[] {
  const personalAssets = getTaskReferenceAssetIds(task, 'personal')
    .map((assetId) => getAsset(assetId))
    .filter((asset): asset is AssetRow => Boolean(asset));
  if (personalAssets.length === 0) {
    throw createOpenAiGenerationFailure({
      status: null,
      providerCode: null,
      providerType: null,
      providerMessage: 'Missing personal reference asset for generation task',
      internalCode: 'OPENAI_MISSING_REFERENCE_ASSET',
      taskMessage: '缺少个人形象参考图，无法开始生成。',
    });
  }

  const styleAssets = getTaskReferenceAssetIds(task, 'style')
    .map((assetId) => getAsset(assetId))
    .filter((asset): asset is AssetRow => Boolean(asset));
  const outputFormat = normalizeOutputFormat(task.output_format);
  const baseFields = {
    model: task.model || defaultImageModel,
    prompt: enhancedPrompt,
    size: normalizeOpenAiSize(task.size),
  } satisfies Record<string, string>;

  const personalFiles = personalAssets.map((asset, index) => toOpenAiImageFile(asset, `personal-reference-${index + 1}`));
  const styleFiles = styleAssets.map((asset, index) => toOpenAiImageFile(asset, `style-reference-${index + 1}`));
  const filesWithStyle = [...personalFiles, ...styleFiles];
  const filesWithoutStyle = personalFiles;

  const withQualityAndFormat = {
    ...baseFields,
    quality: task.quality || defaultImageQuality,
    output_format: outputFormat,
    response_format: 'b64_json',
  };

  const withFormatOnly = {
    ...baseFields,
    quality: task.quality || defaultImageQuality,
    output_format: outputFormat,
  };

  const minimalFields = {
    ...baseFields,
    quality: task.quality || defaultImageQuality,
  };

  const variants: OpenAiEditRequestVariant[] = [
    {
      files: filesWithStyle,
      fields: withQualityAndFormat,
    },
    {
      files: filesWithStyle,
      fields: withFormatOnly,
    },
    {
      files: filesWithStyle,
      fields: minimalFields,
    },
  ];

  if (styleAssets.length > 0) {
    variants.push(
      {
        files: filesWithoutStyle,
        fields: withQualityAndFormat,
      },
      {
        files: filesWithoutStyle,
        fields: withFormatOnly,
      },
      {
        files: filesWithoutStyle,
        fields: minimalFields,
      }
    );
  }

  return variants;
}

function buildOpenAiApiUrl(baseUrl: string, endpointPath: string) {
  const url = new URL(baseUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, '');

  if (normalizedPath.endsWith(endpointPath)) {
    return url.toString();
  }

  if (normalizedPath.endsWith('/v1')) {
    url.pathname = `${normalizedPath}${endpointPath.slice(3)}`;
    return url.toString();
  }

  url.pathname = `${normalizedPath}/v1${endpointPath.slice(3)}`.replace(/\/+/g, '/');
  return url.toString();
}

function buildOpenAiImagesUrl(baseUrl: string) {
  return buildOpenAiApiUrl(baseUrl, '/v1/images/edits');
}

function buildOpenAiChatCompletionsUrl(baseUrl: string) {
  return buildOpenAiApiUrl(baseUrl, '/v1/chat/completions');
}

async function generateEnhancedOpenAiPrompt(task: TaskRow) {
  const personalAssets = getTaskReferenceAssetIds(task, 'personal')
    .map((assetId) => getAsset(assetId))
    .filter((asset): asset is AssetRow => Boolean(asset));
  if (personalAssets.length === 0) {
    throw createOpenAiGenerationFailure({
      status: null,
      providerCode: null,
      providerType: null,
      providerMessage: 'Missing personal reference asset for prompt analysis',
      internalCode: 'OPENAI_MISSING_REFERENCE_ASSET',
      taskMessage: '缺少个人形象参考图，无法开始生成。',
    });
  }

  const styleAssets = getTaskReferenceAssetIds(task, 'style')
    .map((assetId) => getAsset(assetId))
    .filter((asset): asset is AssetRow => Boolean(asset));
  const response = await fetch(buildOpenAiChatCompletionsUrl(openAiBaseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: defaultPromptModel,
      messages: [
        {
          role: 'system',
          content:
            'You improve prompts for an avatar image-edit workflow. Return only the final image-generation prompt text. Do not wrap it in JSON, markdown, quotes, or explanations. When a style reference image is provided, prioritize its medium, art style, and visual language over the photographic realism of the personal reference while preserving the first person\'s recognizable identity.',
        },
        {
          role: 'user',
          content: buildPromptAnalysisMessage(task, personalAssets, styleAssets),
        },
      ],
    }),
    signal: AbortSignal.timeout(openAiRequestTimeoutMs),
  });

  const payload = await readOpenAiChatResponse(response);
  if (!response.ok) {
    throw extractOpenAiFailureFromResponse(response.status, payload);
  }

  const prompt = extractPromptText(payload);
  if (!prompt) {
    throw createOpenAiGenerationFailure({
      status: response.status,
      providerCode: payload.error?.code ?? null,
      providerType: payload.error?.type ?? null,
      providerMessage: 'Prompt model returned empty content',
      internalCode: 'OPENAI_INVALID_RESPONSE',
      taskMessage: '生成服务未能构建有效提示词，请稍后重试。',
    });
  }

  return prompt;
}

function buildPromptAnalysisMessage(task: TaskRow, personalAssets: AssetRow[], styleAssets: AssetRow[]) {
  const styleTags = parseStoredStyleTags(task.style_tags_json);
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: [
        'Project preset: create a single premium AI avatar portrait for a real person with a refined, elegant, warm, luminous, gallery-like result suitable for a premium profile avatar.',
        'The uploaded personal-reference images show the same person. Preserve the real person\'s recognizable identity through facial structure, face shape, eyes, nose, mouth, hairstyle, and signature features. Transfer that identity into the target style as faithfully as possible. Do not invent a different person or change key personal traits. Do not preserve the personal images\' photographic realism, camera look, or literal photo texture unless the requested style is explicitly photographic.',
        styleAssets.length > 0
          ? 'The uploaded style-reference images are style-only references and have style priority. Use their medium, art style, visual language, rendering approach, palette, composition, texture, linework, and atmosphere as the primary target style. If personal references are real selfies/photos and style references are anime, 2D, illustration, watercolor, or any other non-photographic medium, transform the person into that medium instead of preserving photo realism. Never copy identity, facial features, or character design from style references.'
          : 'No style-reference image is provided. Use only the written direction for style while preserving the personal-reference identity.',
        `User prompt: ${task.prompt.trim() || 'None provided.'}`,
        `Style tags: ${styleTags.length > 0 ? styleTags.join(' | ') : 'None.'}`,
        `Personal reference image count: ${personalAssets.length}`,
        `Style reference image count: ${styleAssets.length}`,
        `Requested model: ${task.model || defaultImageModel}`,
        `Requested quality: ${task.quality || defaultImageQuality}`,
        `Requested output size: ${normalizeOpenAiSize(task.size)}`,
        'Return only the final prompt to send to the image edits endpoint.',
      ].join('\n\n'),
    },
    ...personalAssets.map((asset) => ({
      type: 'image_url',
      image_url: {
        url: buildAssetDataUrl(asset),
      },
    })),
    ...styleAssets.map((asset) => ({
      type: 'image_url',
      image_url: {
        url: buildAssetDataUrl(asset),
      },
    })),
  ];

  return content;
}

function buildAssetDataUrl(asset: AssetRow) {
  const absolutePath = path.join(dataRoot, asset.storage_path);
  const buffer = fs.readFileSync(absolutePath);
  const mimeType = asset.mime_type || 'application/octet-stream';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function readOpenAiChatResponse(response: globalThis.Response): Promise<OpenAiChatResponse> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as OpenAiChatResponse;
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

function extractPromptText(payload: OpenAiChatResponse) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim();
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

function getTaskSummary(task: TaskRow) {
  return task.summary || buildFallbackTaskSummary({
    prompt: task.prompt,
    styleTags: parseStoredStyleTags(task.style_tags_json),
    personalReferenceCount: getTaskReferenceAssetIds(task, 'personal').length,
    styleReferenceCount: getTaskReferenceAssetIds(task, 'style').length,
    size: task.size,
  });
}

function getTaskReferenceAssetIds(task: TaskRow, type: 'personal' | 'style') {
  const jsonValue = type === 'personal' ? task.personal_reference_asset_ids_json : task.style_reference_asset_ids_json;
  const fallback = type === 'personal' ? task.personal_reference_asset_id : task.style_reference_asset_id;
  return parseStoredAssetIds(jsonValue, fallback);
}

function getTaskReferenceAssets(task: TaskRow, type: 'personal' | 'style') {
  return getTaskReferenceAssetIds(task, type)
    .map((assetId) => getAsset(assetId))
    .filter((asset): asset is AssetRow => Boolean(asset))
    .map(mapAsset);
}

function parseStoredAssetIds(assetIdsJson: string | null, fallback: string | null) {
  const fallbackIds = fallback ? [fallback] : [];
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
    return '头像生成已完成';
  }
  if (task.status === 'failed') {
    return '头像生成失败';
  }
  return '头像生成进行中';
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
  const verifyAlg = getOidcVerifyAlgorithm(alg);
  const signature = decodeOidcSignature(parts[2], alg);
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

function isSupportedOidcSigningAlg(alg: string): alg is OidcSigningAlg {
  return alg === 'RS256' || alg === 'ES256' || alg === 'ES384';
}

function getOidcVerifyAlgorithm(alg: OidcSigningAlg) {
  if (alg === 'RS256') {
    return 'RSA-SHA256';
  }
  if (alg === 'ES384') {
    return 'SHA384';
  }
  return 'SHA256';
}

function decodeOidcSignature(signaturePart: string, alg: OidcSigningAlg) {
  const signature = Buffer.from(signaturePart, 'base64url');
  if (alg === 'ES256') {
    return joseToDerSignature(signature, 32);
  }
  if (alg === 'ES384') {
    return joseToDerSignature(signature, 48);
  }
  return signature;
}

function findSigningJwk(jwks: OidcJwk[], alg: OidcSigningAlg, kid: string | null) {
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
    if (alg === 'RS256') {
      return key.kty === 'RSA';
    }
    if (alg === 'ES384') {
      return key.kty === 'EC' && key.crv === 'P-384';
    }
    return key.kty === 'EC' && key.crv === 'P-256';
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
    throw new Error('invalid_ecdsa_signature');
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

function parseStoredStyleTags(styleTagsJson: string) {
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

function toOpenAiImageFile(asset: AssetRow, fallbackStem: string) {
  const absolutePath = path.join(dataRoot, asset.storage_path);
  return {
    buffer: fs.readFileSync(absolutePath),
    mimeType: asset.mime_type || 'application/octet-stream',
    fileName: buildOpenAiUploadFilename(asset, fallbackStem),
  };
}

function buildOpenAiUploadFilename(asset: AssetRow, fallbackStem: string) {
  const extension = mimeToExtension(asset.mime_type);
  return `${fallbackStem}${extension}`;
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
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

function extractOpenAiFailureFromResponse(status: number, body: { error?: OpenAiErrorPayload }) {
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
    imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(openAiRequestTimeoutMs) });
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

function normalizeOpenAiSize(size: string) {
  const normalized = normalizeImageDimensions(...parseSize(size));
  return `${normalized.width}x${normalized.height}`;
}

function normalizeImageDimensions(width: number, height: number) {
  const maxEdge = 3840;
  const minPixels = 655_360;
  const maxPixels = 8_294_400;
  const maxAspectRatio = 3;

  let nextWidth = width;
  let nextHeight = height;

  const longestEdge = Math.max(nextWidth, nextHeight);
  if (longestEdge > maxEdge) {
    const scale = maxEdge / longestEdge;
    nextWidth *= scale;
    nextHeight *= scale;
  }

  const aspectRatio = Math.max(nextWidth, nextHeight) / Math.max(1, Math.min(nextWidth, nextHeight));
  if (aspectRatio > maxAspectRatio) {
    if (nextWidth >= nextHeight) {
      nextWidth = nextHeight * maxAspectRatio;
    } else {
      nextHeight = nextWidth * maxAspectRatio;
    }
  }

  const pixels = nextWidth * nextHeight;
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels);
    nextWidth *= scale;
    nextHeight *= scale;
  } else if (pixels < minPixels) {
    const scale = Math.sqrt(minPixels / Math.max(pixels, 1));
    nextWidth *= scale;
    nextHeight *= scale;
  }

  return {
    width: roundToMultipleOf16(nextWidth),
    height: roundToMultipleOf16(nextHeight),
  };
}

function roundToMultipleOf16(value: number) {
  return Math.max(16, Math.round(value / 16) * 16);
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

function parseOptionalPositiveIntegerEnv(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
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

function loadEnvFile(envFilePath: string) {
  let fileContents: string;

  try {
    fileContents = fs.readFileSync(envFilePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }
    throw error;
  }

  for (const [key, value] of parseEnvFile(fileContents)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseEnvFile(contents: string) {
  const values = new Map<string, string>();
  const normalizedContents = contents.replace(/^\uFEFF/, '');

  for (const rawLine of normalizedContents.split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = rawLine.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    const rawValue = rawLine.slice(separatorIndex + 1).trim();
    values.set(key, parseEnvValue(rawValue));
  }

  return values;
}

function parseEnvValue(rawValue: string) {
  if (!rawValue) {
    return '';
  }

  const quote = rawValue[0];
  if (quote === '"' || quote === "'") {
    const closingQuoteIndex = findClosingQuoteIndex(rawValue, quote);
    if (closingQuoteIndex >= 0) {
      return unescapeQuotedEnvValue(rawValue.slice(1, closingQuoteIndex), quote);
    }
  }

  const commentIndex = rawValue.indexOf(' #');
  const valueWithoutComment = commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue;
  return valueWithoutComment.trim();
}

function unescapeQuotedEnvValue(value: string, quote: '"' | "'") {
  if (quote === '"') {
    return value.replace(/\\([\\"nrtbfv])/g, (_match, escaped: string) => {
      switch (escaped) {
        case '\\':
          return '\\';
        case '"':
          return '"';
        case 'n':
          return '\n';
        case 'r':
          return '\r';
        case 't':
          return '\t';
        case 'b':
          return '\b';
        case 'f':
          return '\f';
        case 'v':
          return '\v';
        default:
          return escaped;
      }
    });
  }

  return value.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

function findClosingQuoteIndex(value: string, quote: '"' | "'") {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] === quote && value[index - 1] !== '\\') {
      const trailing = value.slice(index + 1).trim();
      if (!trailing || trailing.startsWith('#')) {
        return index;
      }
    }
  }

  return -1;
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isValidationLikeError(error: unknown) {
  return error instanceof SyntaxError;
}
