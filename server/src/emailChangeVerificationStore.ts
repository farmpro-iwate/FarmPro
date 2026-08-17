import crypto from 'node:crypto';
import { readJson, writeJson } from './jsonStore';

type PendingEmailChange = {
  userId: string;
  email: string;
  codeSalt: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
};

const FILE = 'pendingEmailChanges.json';
const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(code: string, salt: string) {
  return crypto.scryptSync(code, salt, 32).toString('hex');
}

function prune(items: PendingEmailChange[]) {
  const now = Date.now();
  return items.filter((item) => new Date(item.expiresAt).getTime() > now && item.attempts < MAX_ATTEMPTS);
}

export async function createPendingEmailChange(userIdInput: string, emailInput: string) {
  const userId = userIdInput.trim();
  const email = normalizeEmail(emailInput);
  const items = prune(await readJson<PendingEmailChange[]>(FILE, []));
  const code = String(crypto.randomInt(100000, 1000000));
  const codeSalt = crypto.randomBytes(16).toString('hex');
  const now = new Date();

  const pending: PendingEmailChange = {
    userId,
    email,
    codeSalt,
    codeHash: hashCode(code, codeSalt),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    attempts: 0,
    createdAt: now.toISOString(),
  };

  await writeJson(FILE, [...items.filter((item) => item.userId !== userId), pending]);
  return { pending, code };
}

export async function verifyPendingEmailChange(userIdInput: string, codeInput: string) {
  const userId = userIdInput.trim();
  const code = codeInput.trim();
  const items = prune(await readJson<PendingEmailChange[]>(FILE, []));
  const index = items.findIndex((item) => item.userId === userId);
  if (index < 0) {
    await writeJson(FILE, items);
    throw new Error('VERIFICATION_NOT_FOUND');
  }

  const pending = items[index];
  const actual = Buffer.from(hashCode(code, pending.codeSalt), 'hex');
  const expected = Buffer.from(pending.codeHash, 'hex');
  const matched = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);

  if (!matched) {
    const next = [...items];
    next[index] = { ...pending, attempts: pending.attempts + 1 };
    await writeJson(FILE, next);
    throw new Error(next[index].attempts >= MAX_ATTEMPTS ? 'VERIFICATION_LOCKED' : 'INVALID_VERIFICATION_CODE');
  }

  await writeJson(FILE, items.filter((item) => item.userId !== userId));
  return pending;
}
