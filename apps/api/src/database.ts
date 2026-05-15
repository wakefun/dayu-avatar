import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dbPath } from './config';
import type { AssetRow, GalleryRow, ResultRow, SessionRow, TaskRow, UserRow } from './types';

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export function initSchema() {
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
      content_hash TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT
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
      completed_at TEXT,
      deleted_at TEXT
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
      saved_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);
  ensureColumn('file_assets', 'content_hash', 'TEXT');
  ensureColumn('file_assets', 'deleted_at', 'TEXT');
  ensureColumn('generation_tasks', 'summary', 'TEXT');
  ensureColumn('generation_tasks', 'personal_reference_asset_ids_json', 'TEXT');
  ensureColumn('generation_tasks', 'style_reference_asset_ids_json', 'TEXT');
  ensureColumn('generation_tasks', 'source_task_id', 'TEXT');
  ensureColumn('generation_tasks', 'deleted_at', 'TEXT');
  ensureColumn('generation_results', 'thumbnail_asset_id', 'TEXT');
  ensureColumn('gallery_items', 'deleted_at', 'TEXT');
}

function ensureColumn(tableName: string, columnName: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export function getUser(userId: string) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
}

export function getSession(sessionId: string) {
  return db.prepare('SELECT id, user_id, auth_mode, expires_at FROM sessions WHERE id = ?').get(sessionId) as SessionRow | undefined;
}

export function getAsset(assetId: string) {
  return db.prepare('SELECT * FROM file_assets WHERE id = ? AND deleted_at IS NULL').get(assetId) as AssetRow | undefined;
}

export function getOwnedAsset(userId: string, assetId: string) {
  return db.prepare('SELECT * FROM file_assets WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(assetId, userId) as AssetRow | undefined;
}

export function getTask(taskId: string) {
  return db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND deleted_at IS NULL').get(taskId) as TaskRow | undefined;
}

export function getOwnedTask(userId: string, taskId: string) {
  return db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(taskId, userId) as TaskRow | undefined;
}

export function getResultByTaskId(taskId: string) {
  return db.prepare('SELECT * FROM generation_results WHERE task_id = ?').get(taskId) as ResultRow | undefined;
}

export function getGalleryItem(itemId: string) {
  return db.prepare('SELECT * FROM gallery_items WHERE id = ? AND deleted_at IS NULL').get(itemId) as GalleryRow | undefined;
}
