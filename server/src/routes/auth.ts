import { Router, type Request } from 'express';
import { authenticate, createToken } from '../authStore';
import { requireAuth } from '../authMiddleware';

export const authRouter = Router();

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;

type LoginAttemptState = {
  failedAttempts: number;
  windowStartedAt: number;
  lockedUntil: number;
};

const loginAttempts = new Map<string, LoginAttemptState>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function clientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function attemptKeys(email: string, ip: string) {
  return [`email:${normalizeEmail(email)}`, `ip:${ip}`];
}

function getState(key: string, now: number) {
  const current = loginAttempts.get(key);
  if (!current) {
    const fresh: LoginAttemptState = {
      failedAttempts: 0,
      windowStartedAt: now,
      lockedUntil: 0,
    };
    loginAttempts.set(key, fresh);
    return fresh;
  }

  if (current.lockedUntil > 0 && current.lockedUntil <= now) {
    const reset: LoginAttemptState = {
      failedAttempts: 0,
      windowStartedAt: now,
      lockedUntil: 0,
    };
    loginAttempts.set(key, reset);
    return reset;
  }

  if (current.lockedUntil === 0 && now - current.windowStartedAt >= ATTEMPT_WINDOW_MS) {
    const reset: LoginAttemptState = {
      failedAttempts: 0,
      windowStartedAt: now,
      lockedUntil: 0,
    };
    loginAttempts.set(key, reset);
    return reset;
  }

  return current;
}

function getRetryAfterSeconds(keys: string[], now: number) {
  let longest = 0;
  for (const key of keys) {
    const state = getState(key, now);
    if (state.lockedUntil > now) {
      longest = Math.max(longest, state.lockedUntil - now);
    }
  }
  return longest > 0 ? Math.max(1, Math.ceil(longest / 1000)) : 0;
}

function recordFailure(keys: string[], now: number) {
  for (const key of keys) {
    const state = getState(key, now);
    const failedAttempts = state.failedAttempts + 1;
    loginAttempts.set(key, {
      failedAttempts,
      windowStartedAt: state.windowStartedAt,
      lockedUntil: failedAttempts >= MAX_FAILED_ATTEMPTS ? now + LOCK_DURATION_MS : 0,
    });
  }
}

function clearFailures(keys: string[]) {
  for (const key of keys) loginAttempts.delete(key);
}

authRouter.post('/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ message: 'メールアドレスとパスワードを入力してください' });
    return;
  }

  const now = Date.now();
  const keys = attemptKeys(email, clientIp(req));
  const retryAfter = getRetryAfterSeconds(keys, now);

  if (retryAfter > 0) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      message: 'ログイン試行回数が上限に達しました。しばらく待ってから再度お試しください',
      retryAfterSeconds: retryAfter,
    });
    return;
  }

  const user = await authenticate(email, password);
  if (!user) {
    recordFailure(keys, now);
    const lockedRetryAfter = getRetryAfterSeconds(keys, now);

    if (lockedRetryAfter > 0) {
      res.setHeader('Retry-After', String(lockedRetryAfter));
      res.status(429).json({
        message: 'ログイン試行回数が上限に達しました。15分後に再度お試しください',
        retryAfterSeconds: lockedRetryAfter,
      });
      return;
    }

    res.status(401).json({ message: 'メールアドレスまたはパスワードが違います' });
    return;
  }

  clearFailures(keys);
  res.json({ token: createToken(user), user });
});

authRouter.get('/me', requireAuth, (_req, res) => {
  res.json({ user: res.locals.authUser });
});
