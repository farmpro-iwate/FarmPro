import crypto from 'node:crypto';
import { readJson, writeJson } from './jsonStore';

export type PendingRegistration = {
  id: string;
  farmId: string;
  farmName: string;
  name: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  codeSalt: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
};

const FILE = 'pendingRegistrations.json';
const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(code: string, salt: string) {
  return crypto.scryptSync(code, salt, 32).toString('hex');
}

function prune(items: PendingRegistration[]) {
  const now = Date.now();
  return items.filter((item) => new Date(item.expiresAt).getTime() > now && item.attempts < MAX_ATTEMPTS);
}

export async function createPendingRegistration(input: Omit<PendingRegistration, 'id' | 'codeSalt' | 'codeHash' | 'expiresAt' | 'attempts' | 'createdAt'>) {
  const items = prune(await readJson<PendingRegistration[]>(FILE, []));
  const email = normalizeEmail(input.email);
  const code = String(crypto.randomInt(100000, 1000000));
  const codeSalt = crypto.randomBytes(16).toString('hex');
  const now = new Date();

  const pending: PendingRegistration = {
    ...input,
    id: crypto.randomUUID(),
    email,
    codeSalt,
    codeHash: hashCode(code, codeSalt),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    attempts: 0,
    createdAt: now.toISOString(),
  };

  const next = [...items.filter((item) => item.email !== email), pending];
  await writeJson(FILE, next);
  return { pending, code };
}

export async function verifyPendingRegistration(emailInput: string, codeInput: string) {
  const email = normalizeEmail(emailInput);
  const code = codeInput.trim();
  const items = prune(await readJson<PendingRegistration[]>(FILE, []));
  const index = items.findIndex((item) => item.email === email);
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

  await writeJson(FILE, items.filter((item) => item.id !== pending.id));
  return pending;
}
