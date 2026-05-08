import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Request, Response } from 'express';

export function getRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

export function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

export function toStaticUrl(relativeUrl: string) {
  return `/static${relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`}`;
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function formatMonthPath() {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export function mix(from: number, to: number, ratio: number) {
  return from + (to - from) * ratio;
}

export function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number(value?.trim() || fallback);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

export function parseMode<T extends string>(value: string | undefined, validValues: readonly T[], fallback: T): T {
  if (value && validValues.includes(value as T)) {
    return value as T;
  }
  return fallback;
}

export function parseOptionalPositiveIntegerEnv(value: string | undefined, fallback: number) {
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

export function saveSession(sessionData: Express.Request['session']) {
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

export function destroySession(req: Request) {
  return new Promise<void>((resolve) => {
    req.session.destroy(() => {
      resolve();
    });
  });
}

export function loadEnvFile(envFilePath: string) {
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

export function parseEnvFile(contents: string) {
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

export function parseEnvValue(rawValue: string) {
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

export function unescapeQuotedEnvValue(value: string, quote: '"' | "'") {
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

export function findClosingQuoteIndex(value: string, quote: '"' | "'") {
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

export function isMissingFileError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function isValidationLikeError(error: unknown) {
  return error instanceof SyntaxError;
}
