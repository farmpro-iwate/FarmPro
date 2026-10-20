import crypto from 'node:crypto';

// LINE Login v2.1 server-only OAuth helpers. Intentionally not mounted as API routes.
// The application must implement expiring, single-use state/nonce storage and account
// mapping before calling these functions. Never expose clientSecret to the browser.
const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

export type LineLoginConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type VerifiedLineIdentity = {
  subject: string;
  displayName?: string;
  email?: string;
};

export function createLineLoginChallenge() {
  return {
    state: crypto.randomBytes(32).toString('hex'),
    nonce: crypto.randomBytes(32).toString('hex'),
  };
}

export function getLineLoginConfig(env: NodeJS.ProcessEnv = process.env): LineLoginConfig | null {
  const clientId = env.LINE_LOGIN_CHANNEL_ID?.trim() || '';
  const clientSecret = env.LINE_LOGIN_CHANNEL_SECRET?.trim() || '';
  const redirectUri = env.LINE_LOGIN_CALLBACK_URL?.trim() || '';
  if (!clientId || !clientSecret || !redirectUri) return null;
  if (!/^https:\/\//.test(redirectUri)) throw new Error('LINE_CALLBACK_HTTPS_REQUIRED');
  return { clientId, clientSecret, redirectUri };
}

export function makeLineAuthorizationUrl(
  config: LineLoginConfig,
  challenge: { state: string; nonce: string },
): string {
  if (!/^[a-f0-9]{64}$/.test(challenge.state) || !/^[a-f0-9]{64}$/.test(challenge.nonce)) {
    throw new Error('LINE_INVALID_CHALLENGE');
  }
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', challenge.state);
  url.searchParams.set('nonce', challenge.nonce);
  url.searchParams.set('scope', 'openid profile');
  return url.toString();
}

export async function exchangeAndVerifyLineCode(
  config: LineLoginConfig,
  code: string,
  nonce: string,
): Promise<VerifiedLineIdentity> {
  if (!code || !nonce) throw new Error('LINE_MISSING_CODE_OR_NONCE');

  const tokenResponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenResponse.ok) {
    // Preview-only diagnostics: fixed HTTP status, never tokens, codes, IDs or response bodies.
    if (process.env.FARMPRO_LINE_FULL_APP_PREVIEW === 'true') {
      // Only log a fixed allowlisted error category; never log provider descriptions or credentials.
      let category = 'unknown';
      try {
        const body = await tokenResponse.clone().json() as { error?: unknown };
        const allowlisted = ['invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client', 'unsupported_grant_type'];
        if (typeof body.error === 'string' && allowlisted.includes(body.error)) category = body.error;
      } catch { /* Unrecognized provider response; do not record its contents. */ }
      console.error('LINE token exchange HTTP status', { status: tokenResponse.status, category });
    }
    throw new Error('LINE_TOKEN_EXCHANGE_FAILED');
  }
  const token = await tokenResponse.json() as { id_token?: string };
  if (!token.id_token) throw new Error('LINE_ID_TOKEN_MISSING');

  // LINE validates ID token signature, audience, expiry and nonce on this endpoint.
  const verifyResponse = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      id_token: token.id_token,
      client_id: config.clientId,
      nonce,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!verifyResponse.ok) throw new Error('LINE_ID_TOKEN_INVALID');
  const identity = await verifyResponse.json() as {
    sub?: string;
    name?: string;
    email?: string;
    iss?: string;
    aud?: string;
    exp?: number;
    nonce?: string;
  };
  if (!identity.sub || identity.iss !== 'https://access.line.me' ||
      identity.aud !== config.clientId || identity.nonce !== nonce ||
      typeof identity.exp !== 'number' || identity.exp * 1000 <= Date.now()) {
    throw new Error('LINE_ID_TOKEN_CLAIMS_INVALID');
  }
  return {
    subject: identity.sub,
    ...(identity.name ? { displayName: identity.name } : {}),
    ...(identity.email ? { email: identity.email } : {}),
  };
}
