import path from 'node:path';
import { normalizeOpenAiBaseUrl } from './openai-generation';
import type { AuthMode, GenerationMode } from './types';
import { loadEnvFile, parseMode, parseOptionalPositiveIntegerEnv, parsePort } from './utils';

const apiRoot = path.resolve(__dirname, '..');
export const repoRoot = path.resolve(apiRoot, '../..');
loadEnvFile(path.join(repoRoot, '.env'));

export const dataRoot = process.env.DAYU_DATA_ROOT ? path.resolve(process.env.DAYU_DATA_ROOT) : path.join(repoRoot, 'data');
export const uploadsRoot = path.join(dataRoot, 'uploads');
export const generatedRoot = path.join(dataRoot, 'generated');
export const webDistRoot = path.join(repoRoot, 'apps/web/dist');
export const webIndexPath = path.join(webDistRoot, 'index.html');
export const dbPath = path.join(dataRoot, 'app.db');

export const port = parsePort(process.env.PORT, 3001);
export const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
export const sessionSecret = process.env.SESSION_SECRET ?? 'dayu-avatar-dev-secret';
export const authMode = parseMode<AuthMode>(process.env.AUTH_MODE, ['mock', 'oidc'], 'mock');
export const generationMode = parseMode<GenerationMode>(process.env.GENERATION_MODE, ['mock', 'openai'], 'mock');
export const openAiBaseUrl = normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL);
export const openAiApiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
export const defaultImageModel = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2';
export const defaultPromptModel = process.env.OPENAI_PROMPT_MODEL?.trim() || 'gpt-5.5';
export const defaultImageQuality = process.env.OPENAI_IMAGE_QUALITY?.trim() || 'high';
export const defaultOpenAiRequestTimeoutMs = 600_000;
export const openAiRequestTimeoutMs = parseOptionalPositiveIntegerEnv(process.env.OPENAI_REQUEST_TIMEOUT_MS, defaultOpenAiRequestTimeoutMs);
export const cwebpBin = process.env.CWEBP_BIN?.trim() || 'cwebp';
export const oidcDiscoveryUrl = process.env.OIDC_DISCOVERY_URL ?? '';
export const oidcClientId = process.env.OIDC_CLIENT_ID ?? '';
export const oidcClientSecret = process.env.OIDC_CLIENT_SECRET ?? '';
export const oidcRedirectUri = process.env.OIDC_REDIRECT_URI ?? '';
export const oidcPostLogoutRedirectUri = process.env.OIDC_POST_LOGOUT_REDIRECT_URI ?? '';

export function buildFrontendUrl(pathname: string) {
  return new URL(pathname, webOrigin).toString();
}
