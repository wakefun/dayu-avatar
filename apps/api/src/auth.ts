import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import {
  authMode,
  buildFrontendUrl,
  oidcClientId,
  oidcClientSecret,
  oidcDiscoveryUrl,
  oidcPostLogoutRedirectUri,
  oidcRedirectUri,
  webOrigin,
} from './config';
import { db, getUser } from './database';
import { ensureSeedTasks } from './generation';
import { createId, nowIso, saveSession, sendError, slugify } from './utils';

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

let oidcDiscoveryPromise: Promise<OidcDiscoveryDocument> | null = null;
let oidcJwksPromise: Promise<OidcJwk[]> | null = null;
let oidcJwksUri: string | null = null;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
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

export async function completeMockLogin(req: Request, displayName: string) {
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

export async function startOidcLogin(req: Request, res: Response) {
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

export function clearOidcHandshake(sessionData: session.SessionData) {
  delete sessionData.oidcState;
  delete sessionData.oidcNonce;
  delete sessionData.oidcCodeVerifier;
}

export function upsertOidcUser(claims: OidcIdTokenClaims, providerSubject: string) {
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

export async function getOidcDiscovery() {
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

export async function getOidcEndSessionEndpoint() {
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

export async function exchangeOidcCode(discovery: OidcDiscoveryDocument, code: string, codeVerifier: string) {
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

export async function verifyOidcIdToken(idToken: string, discovery: OidcDiscoveryDocument, expectedNonce: string) {
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

export function redirectToLoginError(res: Response, message: string) {
  const loginUrl = new URL('/login', webOrigin);
  loginUrl.searchParams.set('error', message);
  res.redirect(loginUrl.toString());
}

export { buildFrontendUrl, oidcPostLogoutRedirectUri };

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
