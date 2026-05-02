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
  }
}

type AssetCategory = 'personal_reference' | 'style_reference' | 'generated_result' | 'generated_thumbnail';
type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
type AuthMode = 'mock' | 'oidc';

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

const repoRoot = path.resolve(process.cwd(), '../..');
const dataRoot = path.join(repoRoot, 'data');
const uploadsRoot = path.join(dataRoot, 'uploads');
const generatedRoot = path.join(dataRoot, 'generated');
const dbPath = path.join(dataRoot, 'app.db');
const port = Number(process.env.PORT ?? 3001);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const sessionSecret = process.env.SESSION_SECRET ?? 'dayu-avatar-dev-secret';

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
      const authMode = (sessionData.authMode ?? null) as AuthMode | null;
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
      ).run(sid, userId, authMode, JSON.stringify(sessionData), expiresAt, now, now);

      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      db.prepare('UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), sid);
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
      secure: false,
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
    res.json({ user: null });
    return;
  }

  const user = getUser(req.session.userId);

  if (!user) {
    req.session.destroy(() => {
      res.json({ user: null });
    });
    return;
  }

  res.json({ user: mapUser(user) });
});

app.post('/api/auth/mock-login', (req, res) => {
  const displayName = typeof req.body?.displayName === 'string' && req.body.displayName.trim() ? req.body.displayName.trim() : '大宇体验用户';
  const email = `${slugify(displayName)}@mock.dayu.local`;
  const providerSubject = `mock:${email}`;

  const account = db
    .prepare('SELECT user_id FROM auth_accounts WHERE provider = ? AND provider_subject = ?')
    .get('mock', providerSubject) as { user_id: string } | undefined;

  const userId = account?.user_id ?? createUser(displayName, email);
  upsertMockAccount(userId, providerSubject);
  ensureSeedTasks(userId);

  req.session.userId = userId;
  req.session.authMode = 'mock';
  req.session.save(() => {
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
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('dayu.sid');
    res.json({ success: true });
  });
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
    model: typeof generationParams.model === 'string' ? generationParams.model : 'gpt-image-2',
    quality: typeof generationParams.quality === 'string' ? generationParams.quality : 'high',
    size: typeof generationParams.size === 'string' ? generationParams.size : '1024x1536',
    outputFormat: typeof generationParams.outputFormat === 'string' ? generationParams.outputFormat : 'png',
    sourceTaskId: null,
  });

  res.status(201).json({ task: mapTask(task) });
});

app.get('/api/generation-tasks/:taskId', requireAuth, (req, res) => {
  const taskId = getRouteParam(req.params.taskId);
  const task = syncAndGetOwnedTask(req.session.userId!, taskId);

  if (!task) {
    sendError(res, 404, 'NOT_FOUND', 'task not found');
    return;
  }

  res.json({ task: mapTask(task, true) });
});

app.get('/api/generation-tasks/:taskId/progress', requireAuth, (req, res) => {
  const taskId = getRouteParam(req.params.taskId);
  const task = syncAndGetOwnedTask(req.session.userId!, taskId);

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
      message: task.status === 'completed' ? 'Mock generation complete' : 'Mock generation in progress',
    },
  });
});

app.get('/api/generation-tasks/:taskId/result', requireAuth, (req, res) => {
  const taskId = getRouteParam(req.params.taskId);
  const task = syncAndGetOwnedTask(req.session.userId!, taskId);

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

app.get('/api/queue', requireAuth, (req, res) => {
  syncUserTasks(req.session.userId!);
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
});

app.get('/api/history', requireAuth, (req, res) => {
  syncUserTasks(req.session.userId!);
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
});

app.get('/api/gallery-items', requireAuth, (_req, res) => {
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
    .all(_req.session.userId!) as Array<GalleryRow & { task_id: string; image_url: string; thumbnail_url: string | null }>;

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
  const message = err instanceof Error ? err.message : 'unexpected error';
  sendError(res, 500, 'INTERNAL_ERROR', message);
});

app.listen(port, () => {
  console.log(`dayu api listening on http://localhost:${port}`);
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

function createUploadedAsset(userId: string, category: 'personal_reference' | 'style_reference', file: Express.Multer.File): AssetRow {
  const id = createId('asset');
  const extension = path.extname(file.originalname) || mimeToExtension(file.mimetype);
  const monthFolder = formatMonthPath();
  const fileName = `${id}${extension}`;
  const storagePath = path.join('uploads', category, monthFolder, fileName);
  const absolutePath = path.join(dataRoot, storagePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, file.buffer);

  const row: AssetRow = {
    id,
    user_id: userId,
    category,
    storage_path: storagePath,
    public_url: `/${storagePath.replaceAll(path.sep, '/')}`,
    file_name: file.originalname,
    mime_type: file.mimetype || 'application/octet-stream',
    width: null,
    height: null,
    byte_size: file.size,
    created_at: nowIso(),
  };

  db.prepare(
    `INSERT INTO file_assets (id, user_id, category, storage_disk, storage_path, public_url, file_name, mime_type, width, height, byte_size, created_at)
     VALUES (?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.user_id,
    row.category,
    row.storage_path,
    toStaticUrl(row.public_url),
    row.file_name,
    row.mime_type,
    row.width,
    row.height,
    row.byte_size,
    row.created_at
  );

  return getAsset(row.id)!;
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
    model: 'gpt-image-2',
    quality: 'high',
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
    model: 'gpt-image-2',
    quality: 'high',
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
    model: 'gpt-image-2',
    quality: 'high',
    size: '1024x1536',
    outputFormat: 'png',
    sourceTaskId: null,
  });

  const now = Date.now();
  db.prepare(
    `UPDATE generation_tasks SET status = 'completed', progress_percent = 100, progress_step = '生成完成',
     created_at = ?, updated_at = ?, completed_at = ? WHERE id = ?`
  ).run(new Date(now - 1000 * 60 * 30).toISOString(), new Date(now - 1000 * 60 * 29).toISOString(), new Date(now - 1000 * 60 * 29).toISOString(), completed.id);
  ensureGenerationResult(completed.id);

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

function syncUserTasks(userId: string) {
  const activeTasks = db
    .prepare("SELECT id FROM generation_tasks WHERE user_id = ? AND status IN ('queued', 'processing')")
    .all(userId) as Array<{ id: string }>;

  for (const task of activeTasks) {
    syncTask(task.id);
  }
}

function syncAndGetOwnedTask(userId: string, taskId: string) {
  const owned = getOwnedTask(userId, taskId);
  if (!owned) {
    return null;
  }

  syncTask(taskId);
  return getOwnedTask(userId, taskId);
}

function syncTask(taskId: string) {
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

  db.prepare(
    "UPDATE generation_tasks SET status = 'completed', progress_percent = 100, progress_step = '生成完成', updated_at = ?, completed_at = ? WHERE id = ?"
  ).run(nowIso(), nowIso(), taskId);
  ensureGenerationResult(taskId);
  return getTask(taskId);
}

function ensureGenerationResult(taskId: string) {
  const existing = getResultByTaskId(taskId);
  if (existing) {
    return existing;
  }

  const task = getTask(taskId);
  if (!task) {
    return null;
  }

  const [width, height] = parseSize(task.size);
  const imageAsset = createGeneratedAsset(task.user_id, task.id, 'generated_result', width, height, task.prompt, false);
  const thumbAsset = createGeneratedAsset(task.user_id, task.id, 'generated_thumbnail', Math.floor(width / 2), Math.floor(height / 2), task.prompt, true);
  const resultId = createId('res');

  db.prepare(
    'INSERT INTO generation_results (id, task_id, image_asset_id, thumbnail_asset_id, saved_to_gallery, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(resultId, taskId, imageAsset.id, thumbAsset.id, nowIso());

  return getResultByTaskId(taskId);
}

function createGeneratedAsset(
  userId: string,
  taskId: string,
  category: 'generated_result' | 'generated_thumbnail',
  width: number,
  height: number,
  seed: string,
  thumbnail: boolean
) {
  const id = createId('asset');
  const monthFolder = formatMonthPath();
  const fileName = `${taskId}-${thumbnail ? 'thumb' : 'result'}.png`;
  const storagePath = path.join('generated', monthFolder, taskId, fileName);
  const absolutePath = path.join(dataRoot, storagePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, createGradientPng(width, height, seed, thumbnail));

  db.prepare(
    `INSERT INTO file_assets (id, user_id, category, storage_disk, storage_path, public_url, file_name, mime_type, width, height, byte_size, created_at)
     VALUES (?, ?, ?, 'local', ?, ?, ?, 'image/png', ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    category,
    storagePath,
    toStaticUrl(`/${storagePath.replaceAll(path.sep, '/')}`),
    fileName,
    width,
    height,
    fs.statSync(absolutePath).size,
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
      message: task.status === 'completed' ? 'Mock generation complete' : 'Mock generation in progress',
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
