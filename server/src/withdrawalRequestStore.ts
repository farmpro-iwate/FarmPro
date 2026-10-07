import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AuthUser } from './authStore';

// Intake only: no account, billing, token or farm record is ever written here.
// The existing deployment has one Node process. This queue protects only this
// new ledger, not unrelated stores and not a multi-process deployment.
export type WithdrawalRequest = {
  id: string;
  userId: string;
  farmId: string;
  farmName: string;
  name: string;
  email: string;
  planAtRequest: 'free' | 'standard' | 'pro';
  timing: 'after_paid_period' | 'consult_first';
  status: 'pending' | 'cancelled';
  requestedAt: string;
  cancelledAt?: string;
};
type Identity = Pick<AuthUser, 'id' | 'farmId'>;
const FILE = 'withdrawal-requests.json';
const LIMIT = 4 * 1024 * 1024;
const queues = new Map<string, Promise<void>>();
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const validRequestId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validTime = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const rootPath = () => path.resolve(process.env.FARMPRO_DATA_DIR?.trim() || path.join(process.cwd(), 'data'));
const isOperator = (email: string) => (process.env.FARMPRO_OPERATOR_EMAILS || '').split(',').map((part) => part.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());

async function serial<T>(action: (root: string) => Promise<T>): Promise<T> {
  const root = rootPath();
  const prior = queues.get(root) || Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => { release = resolve; });
  const tail = prior.then(() => turn);
  queues.set(root, tail);
  await prior;
  try { return await action(root); }
  finally { release(); if (queues.get(root) === tail) queues.delete(root); }
}

async function readFile(root: string, file: string, optional = false): Promise<unknown> {
  try {
    const target = path.join(root, file);
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMIT) throw new Error('WITHDRAWAL_STORE_UNAVAILABLE');
    const raw = await fs.readFile(target, 'utf-8');
    if (Buffer.byteLength(raw) > LIMIT) throw new Error('WITHDRAWAL_STORE_UNAVAILABLE');
    return JSON.parse(raw);
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('WITHDRAWAL_STORE_UNAVAILABLE');
  }
}

async function currentUser(root: string, identity: Identity) {
  if (!validId(identity?.id) || !validId(identity?.farmId)) throw new Error('WITHDRAWAL_UNAUTHORIZED');
  const value = await readFile(root, 'users.json');
  if (!Array.isArray(value)) throw new Error('WITHDRAWAL_STORE_UNAVAILABLE');
  const matches = value.filter((item) => item?.id === identity.id);
  const user = matches[0];
  if (matches.length !== 1 || !user.active || user.farmId !== identity.farmId) throw new Error('WITHDRAWAL_UNAUTHORIZED');
  if (typeof user.email !== 'string' || !user.email.includes('@') || typeof user.farmName !== 'string' || typeof user.name !== 'string') {
    throw new Error('WITHDRAWAL_STORE_UNAVAILABLE');
  }
  return { id: user.id as string, farmId: user.farmId as string, farmName: user.farmName as string,
    name: user.name as string, email: user.email as string, role: user.role as string,
    plan: (user.plan === 'standard' || user.plan === 'pro' ? user.plan : 'free') as WithdrawalRequest['planAtRequest'] };
}

async function readRequests(root: string): Promise<WithdrawalRequest[]> {
  const value = await readFile(root, FILE, true) as { version?: unknown; requests?: unknown } | null;
  if (value === null) return [];
  if (value.version !== 1 || !Array.isArray(value.requests)) throw new Error('WITHDRAWAL_STORE_UNAVAILABLE');
  const ids = new Set<string>();
  const pending = new Set<string>();
  for (const row of value.requests) {
    if (!row || !validRequestId(row.id) || ids.has(row.id) || !validId(row.userId) || !validId(row.farmId) ||
        typeof row.farmName !== 'string' || typeof row.name !== 'string' || typeof row.email !== 'string' ||
        !row.email.includes('@') || !['free', 'standard', 'pro'].includes(row.planAtRequest) ||
        !['after_paid_period', 'consult_first'].includes(row.timing) || !['pending', 'cancelled'].includes(row.status) ||
        !validTime(row.requestedAt) || (row.status === 'cancelled' ? !validTime(row.cancelledAt) : row.cancelledAt !== undefined)) {
      throw new Error('WITHDRAWAL_STORE_UNAVAILABLE');
    }
    ids.add(row.id);
    if (row.status === 'pending') {
      if (pending.has(row.userId)) throw new Error('WITHDRAWAL_STORE_UNAVAILABLE');
      pending.add(row.userId);
    }
  }
  return value.requests as WithdrawalRequest[];
}

async function publish(root: string, requests: WithdrawalRequest[]) {
  const data = JSON.stringify({ version: 1, requests }, null, 2);
  if (Buffer.byteLength(data) > LIMIT) throw new Error('WITHDRAWAL_STORE_UNAVAILABLE');
  const target = path.join(root, FILE);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, data, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, target);
  } finally {
    await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }
}

function requestReason(user: Awaited<ReturnType<typeof currentUser>>) {
  if (isOperator(user.email)) return '運営者ご自身の退会については、お問い合わせ窓口でご相談ください。';
  if (user.role !== 'owner') return '農場の代表アカウントからお申し出いただくか、お問い合わせ窓口へご相談ください。';
  return '';
}
function state(user: Awaited<ReturnType<typeof currentUser>>, requests: WithdrawalRequest[]) {
  const own = requests.filter((row) => row.userId === user.id && row.farmId === user.farmId);
  const request = own.find((row) => row.status === 'pending') || own.at(-1) || null;
  const reason = requestReason(user);
  return { user: { id: user.id, farmId: user.farmId, farmName: user.farmName, name: user.name, email: user.email },
    request, canRequest: !reason && request?.status !== 'pending', reason,
    accountChanged: false as const, billingChanged: false as const, deleted: false as const };
}
function inputObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('WITHDRAWAL_CONFIRMATION_REQUIRED');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !fields.includes(key)) || !validRequestId(body.requestId) || body.confirmed !== true) {
    throw new Error('WITHDRAWAL_CONFIRMATION_REQUIRED');
  }
  return { ...body };
}

export function getWithdrawalRequest(identity: Identity) {
  return serial(async (root) => state(await currentUser(root, identity), await readRequests(root)));
}

export function submitWithdrawalRequest(identity: Identity, value: unknown) {
  const body = inputObject(value, ['requestId', 'timing', 'confirmed']);
  const id = body.requestId as string;
  const timing = body.timing;
  if (timing !== 'after_paid_period' && timing !== 'consult_first') throw new Error('WITHDRAWAL_CONFIRMATION_REQUIRED');
  return serial(async (root) => {
    const user = await currentUser(root, identity);
    if (requestReason(user)) throw new Error('WITHDRAWAL_CONTACT_REQUIRED');
    const requests = await readRequests(root);
    const same = requests.find((row) => row.id === id);
    if (same) {
      if (same.userId !== user.id || same.farmId !== user.farmId || same.timing !== timing || same.status !== 'pending') {
        throw new Error('WITHDRAWAL_REQUEST_CHANGED');
      }
      return { ...state(user, requests), alreadyRequested: true };
    }
    if (requests.some((row) => row.userId === user.id && row.status === 'pending')) throw new Error('WITHDRAWAL_REQUEST_EXISTS');
    const request: WithdrawalRequest = { id, userId: user.id, farmId: user.farmId, farmName: user.farmName,
      name: user.name, email: user.email, planAtRequest: user.plan, timing, status: 'pending', requestedAt: new Date().toISOString() };
    const next = [...requests, request];
    await publish(root, next);
    return { ...state(user, next), alreadyRequested: false };
  });
}

export function cancelWithdrawalRequest(identity: Identity, value: unknown) {
  const id = inputObject(value, ['requestId', 'confirmed']).requestId as string;
  return serial(async (root) => {
    const user = await currentUser(root, identity);
    const requests = await readRequests(root);
    const index = requests.findIndex((row) => row.id === id && row.userId === user.id && row.farmId === user.farmId);
    if (index < 0) throw new Error('WITHDRAWAL_REQUEST_NOT_FOUND');
    if (requests[index].status !== 'cancelled') {
      requests[index] = { ...requests[index], status: 'cancelled', cancelledAt: new Date().toISOString() };
      await publish(root, requests);
    }
    // Replaying an old cancellation never changes a newer pending request.
    return state(user, requests);
  });
}

export function listWithdrawalRequests(identity: Identity) {
  return serial(async (root) => {
    const user = await currentUser(root, identity);
    if (!isOperator(user.email)) throw new Error('WITHDRAWAL_OPERATOR_REQUIRED');
    const requests = await readRequests(root);
    return { requests: [...requests].reverse(), pendingCount: requests.filter((row) => row.status === 'pending').length };
  });
}
