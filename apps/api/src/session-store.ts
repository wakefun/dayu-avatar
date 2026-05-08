import session from 'express-session';
import { db } from './database';
import type { AuthMode } from './types';
import { nowIso } from './utils';

export class SQLiteSessionStore extends session.Store {
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

export function getSessionExpiry(sessionData: session.SessionData) {
  const expires = sessionData.cookie?.expires;
  if (!expires) {
    return new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  }
  return new Date(expires).toISOString();
}
