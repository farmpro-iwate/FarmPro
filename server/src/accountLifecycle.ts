import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type WithdrawalCompletion = {
  id: string; userId: string; farmId: string; actorId: string;
  startedAt: string; completedAt?: string; status: 'processing' | 'completed';
};
const queues = new Map<string, Promise<void>>();
export const runtimeRoot = () => path.resolve(process.env.FARMPRO_DATA_DIR?.trim() || path.join(process.cwd(), 'data'));
export const operatorEmail = (email: string) => (process.env.FARMPRO_OPERATOR_EMAILS || '').split(',').some(x => x.trim().toLowerCase() === email.trim().toLowerCase());
export const safeId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export async function lifecycleLock<T>(action: (root: string) => Promise<T>): Promise<T> {
  const root = runtimeRoot(); const prior = queues.get(root) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>(resolve => { release = resolve; });
  const tail = prior.then(() => next); queues.set(root, tail); await prior;
  try { return await action(root); }
  finally { release(); if (queues.get(root) === tail) queues.delete(root); }
}
export async function strictRead(root: string, file: string, optional = false): Promise<any> {
  const target = path.join(root, file);
  try {
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) throw new Error();
    return JSON.parse(await fs.readFile(target, 'utf8'));
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
  }
}
export async function atomicWrite(root: string, file: string, value: unknown) {
  const target = path.join(root, file); const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, target);
  } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
export async function withdrawalCompletions(root = runtimeRoot()): Promise<WithdrawalCompletion[]> {
  const value = await strictRead(root, 'account-withdrawals.json', true);
  if (value === undefined) return [];
  if (!value || value.version !== 1 || !Array.isArray(value.operations)) throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
  const ids = new Set<string>(); const users = new Set<string>(); const farms = new Set<string>();
  for (const row of value.operations) {
    if (!row || !safeId(row.id) || !safeId(row.userId) || !safeId(row.farmId) || !safeId(row.actorId) ||
      ids.has(row.id) || users.has(row.userId) || farms.has(row.farmId) ||
      !['processing','completed'].includes(row.status) || !Number.isFinite(Date.parse(row.startedAt)) ||
      (row.status === 'completed' && !Number.isFinite(Date.parse(row.completedAt)))) throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
    ids.add(row.id); users.add(row.userId); farms.add(row.farmId);
  }
  return value.operations;
}
export async function saveCompletions(root: string, operations: WithdrawalCompletion[]) {
  await atomicWrite(root, 'account-withdrawals.json', { version: 1, operations });
}
