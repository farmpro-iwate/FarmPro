import crypto from 'node:crypto';
import { readJson, writeJson } from './jsonStore';
import { assertFarmNotRetired, assertVerificationNotRetired, withAccountDataLock } from './accountDeletionGuard';

type PendingPasswordReset = {
  email: string;
  userId?: string;
  codeSalt: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
};

const FILE = 'pendingPasswordResets.json';
const TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(code: string, salt: string) {
  return crypto.scryptSync(code, salt, 32).toString('hex');
}

function prune(items: PendingPasswordReset[]) {
  const now = Date.now();
  return items.filter((item) => new Date(item.expiresAt).getTime() > now && item.attempts < MAX_ATTEMPTS);
}

async function resetAccount(email: string) {
  const users = await readJson<{ id: string; farmId: string; email: string }[]>('users.json', []);
  const user = users.find((item) => item.email.toLowerCase() === email);
  if (!user) throw new Error('VERIFICATION_NOT_FOUND');
  await assertFarmNotRetired(user.farmId);
  return user;
}

export function createPendingPasswordReset(emailInput: string) {
  return withAccountDataLock(async () => {
    const items = prune(await readJson<PendingPasswordReset[]>(FILE, []));
    const email = normalizeEmail(emailInput);
    const user = await resetAccount(email);
    const code = String(crypto.randomInt(100000, 1000000));
    const codeSalt = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const pending: PendingPasswordReset = {
      email,
      userId: user.id,
      codeSalt,
      codeHash: hashCode(code, codeSalt),
      expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
      attempts: 0,
      createdAt: now.toISOString(),
    };
    await writeJson(FILE, [...items.filter((item) => item.email !== email), pending]);
    return { code };
  });
}

export function verifyPendingPasswordReset(emailInput: string, codeInput: string) {
  return withAccountDataLock(async () => {
    const email = normalizeEmail(emailInput);
    const code = codeInput.trim();
    const items = prune(await readJson<PendingPasswordReset[]>(FILE, []));
    const index = items.findIndex((item) => item.email === email);
    if (index < 0) {
      await writeJson(FILE, items);
      throw new Error('VERIFICATION_NOT_FOUND');
    }

    const pending = items[index];
    const user = await resetAccount(email);
    if (pending.userId && pending.userId !== user.id) throw new Error('VERIFICATION_NOT_FOUND');
    // Includes legacy codes without userId: deletion invalidates their issue time.
    await assertVerificationNotRetired(email, pending.createdAt);
    const actual = Buffer.from(hashCode(code, pending.codeSalt), 'hex');
    const expected = Buffer.from(pending.codeHash, 'hex');
    const matched = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);

    if (!matched) {
      const next = [...items];
      next[index] = { ...pending, attempts: pending.attempts + 1 };
      await writeJson(FILE, next);
      throw new Error(next[index].attempts >= MAX_ATTEMPTS ? 'VERIFICATION_LOCKED' : 'INVALID_VERIFICATION_CODE');
    }

    await writeJson(FILE, items.filter((item) => item.email !== email));
    return { userId: user.id };
  });
}
