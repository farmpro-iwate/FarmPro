import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type AccountRetirement = {
  userId: string;
  farmId: string;
  actorId: string;
  retiredAt: string;
  accountDigest: string;
};

// One Node process owns the JSON store. Deletion and JSON publication must not
// overlap. Reentrant calls use the same lock, including fallback initialization.
const queues = new Map<string, Promise<void>>();
const held = new AsyncLocalStorage<Set<string>>();
export function accountDataRoot() {
  return path.resolve(process.env.FARMPRO_DATA_DIR?.trim() || path.join(process.cwd(), 'data'));
}
export function validAccountIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}
export async function withAccountDataLock<T>(action: () => Promise<T>): Promise<T> {
  const root = accountDataRoot();
  if (held.getStore()?.has(root)) return action();
  const previous = queues.get(root) || Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => turn);
  queues.set(root, tail);
  await previous;
  try {
    return await held.run(new Set([...(held.getStore() || []), root]), action);
  } finally {
    release();
    if (queues.get(root) === tail) queues.delete(root);
  }
}

export async function atomicAccountJsonWrite(target: string, value: unknown) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, target);
  } finally {
    await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export async function readAccountRetirements(): Promise<AccountRetirement[]> {
  try {
    const value = JSON.parse(await fs.readFile(path.join(accountDataRoot(), 'account-retirements.json'), 'utf-8'));
    if (value?.version !== 1 || !Array.isArray(value.records)) throw new Error('ACCOUNT_RETIREMENTS_INVALID');
    const users = new Set<string>();
    const farms = new Set<string>();
    for (const item of value.records) {
      if (!item || !validAccountIdentifier(item.userId) || !validAccountIdentifier(item.farmId) ||
          !validAccountIdentifier(item.actorId) || !Number.isFinite(Date.parse(item.retiredAt)) ||
          typeof item.accountDigest !== 'string' || !/^[a-f0-9]{64}$/.test(item.accountDigest) ||
          users.has(item.userId) || farms.has(item.farmId)) throw new Error('ACCOUNT_RETIREMENTS_INVALID');
      users.add(item.userId);
      farms.add(item.farmId);
    }
    return value.records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function markAccountRetired(record: AccountRetirement) {
  return withAccountDataLock(async () => {
    const records = await readAccountRetirements();
    const existing = records.find((item) => item.userId === record.userId || item.farmId === record.farmId);
    if (existing) {
      if (existing.userId !== record.userId || existing.farmId !== record.farmId || existing.accountDigest !== record.accountDigest) {
        throw new Error('ACCOUNT_RETIREMENT_MISMATCH');
      }
      return;
    }
    await atomicAccountJsonWrite(path.join(accountDataRoot(), 'account-retirements.json'), { version: 1, records: [...records, record] });
  });
}

export async function assertFarmNotRetired(farmId: string) {
  if ((await readAccountRetirements()).some((item) => item.farmId === farmId)) throw new Error('ACCOUNT_RETIRED');
}

// A stale account/billing writer must not resurrect a deleted user. During a
// failed deletion, an unchanged inactive user may remain for an operator retry;
// unrelated users can still be updated, but that retired user cannot be changed.
export async function assertGlobalWriteDoesNotRevive(fileName: string, value: unknown) {
  if (!['users.json', 'bank-transfer-applications.json', 'stripeSubscriptions.json'].includes(fileName)) return;
  const retired = await readAccountRetirements();
  if (!retired.length) return;
  if (!Array.isArray(value)) throw new Error('ACCOUNT_WRITE_INVALID');
  const affected = value.filter((row) => retired.some((item) =>
    row && (row.farmId === item.farmId || (fileName === 'users.json' ? row.id : row.userId) === item.userId),
  ));
  if (!affected.length) return;
  let current: unknown;
  try {
    current = JSON.parse(await fs.readFile(path.join(accountDataRoot(), fileName), 'utf-8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    current = [];
  }
  if (!Array.isArray(current)) throw new Error('ACCOUNT_WRITE_INVALID');
  for (const row of affected) {
    if ((fileName === 'users.json' && row.active !== false) ||
        !current.some((old) => JSON.stringify(old) === JSON.stringify(row))) throw new Error('ACCOUNT_RETIRED');
  }
}
