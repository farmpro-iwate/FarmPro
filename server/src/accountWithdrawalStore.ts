import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AuthUser, FarmProUser } from './authStore';
import { atomicWrite, lifecycleLock, operatorEmail, runtimeRoot, safeId, saveCompletions, strictRead, withdrawalCompletions, type WithdrawalCompletion } from './accountLifecycle';
import { withFarmRequest } from './farmRequestGate';

type Proof = { id: string; actorId: string; userId: string; farmId: string; fingerprint: string; expiresAt: number };
const secret = () => {
  const value = process.env.FARMPRO_AUTH_SECRET?.trim();
  if (!value && process.env.NODE_ENV === 'production') throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
  return value || 'farmpro-development-secret-change-me';
};
function sign(value: Proof) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}
function proof(token: unknown, resultOnly = false): Proof {
  if (typeof token !== 'string' || token.length > 2000) throw new Error('WITHDRAWAL_CONFIRMATION_INVALID');
  const [payload, signature, extra] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(payload || '').digest('base64url');
  if (extra || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('WITHDRAWAL_CONFIRMATION_INVALID');
  let value: Proof;
  try { value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new Error('WITHDRAWAL_CONFIRMATION_INVALID'); }
  if (![value.id, value.actorId, value.userId, value.farmId].every(safeId) || typeof value.fingerprint !== 'string' ||
    !Number.isFinite(value.expiresAt) || value.expiresAt + (resultOnly ? 24 * 3600000 : 0) < Date.now()) throw new Error('WITHDRAWAL_CONFIRMATION_EXPIRED');
  return value;
}
function userShape(row: any): row is FarmProUser {
  return !!row && safeId(row.id) && safeId(row.farmId) && typeof row.active === 'boolean' && typeof row.name === 'string' &&
    typeof row.farmName === 'string' && typeof row.email === 'string' && row.email.includes('@') &&
    ['owner','member'].includes(row.role) && (row.plan === undefined || ['free','standard','pro'].includes(row.plan)) &&
    typeof row.passwordSalt === 'string' && typeof row.passwordHash === 'string';
}
async function usersAt(root: string): Promise<FarmProUser[]> {
  const users = await strictRead(root, 'users.json');
  if (!Array.isArray(users) || !users.every(userShape) || new Set(users.map(x => x.id)).size !== users.length) throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
  return users;
}
async function arrayAt(root: string, name: string): Promise<any[]> {
  const value = await strictRead(root, name, true);
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(x => !x || typeof x.userId !== 'string')) throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
  return value;
}
async function stripeEnded(records: any[]) {
  if (records.length === 0) return;
  const key = process.env.STRIPE_SECRET_KEY?.trim() || process.env.FARMPRO_STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('WITHDRAWAL_CARD_REVIEW');
  const customers = new Set<string>();
  for (const row of records) {
    if (row.status !== 'inactive' || typeof row.subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(row.subscriptionId)) throw new Error('WITHDRAWAL_CARD_REVIEW');
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${row.subscriptionId}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw new Error('WITHDRAWAL_CARD_REVIEW');
    const value = await response.json() as { id?: string; status?: string; customer?: string };
    if (value.id !== row.subscriptionId || !['canceled','incomplete_expired'].includes(value.status || '') || typeof value.customer !== 'string' || !/^cus_[A-Za-z0-9]+$/.test(value.customer)) throw new Error('WITHDRAWAL_CARD_REVIEW');
    customers.add(value.customer);
  }
  // A canceled historical subscription alone does not prove that this customer
  // has no other subscription or unsettled invoice. These are read-only checks.
  for (const customer of customers) {
    for (const endpoint of [`subscriptions?customer=${customer}&status=all&limit=100`, `invoices?customer=${customer}&limit=100`]) {
      const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new Error('WITHDRAWAL_CARD_REVIEW');
      const value = await response.json() as { data?: any[]; has_more?: boolean };
      if (!Array.isArray(value.data) || value.has_more !== false) throw new Error('WITHDRAWAL_CARD_REVIEW');
      if (endpoint.startsWith('subscriptions') ? value.data.some(x => !['canceled','incomplete_expired'].includes(x.status)) : value.data.some(x => !['paid','void'].includes(x.status))) throw new Error('WITHDRAWAL_CARD_REVIEW');
    }
  }
}
async function inspect(root: string, actor: Pick<AuthUser,'id'|'farmId'>, targetId: string) {
  const users = await usersAt(root);
  const caller = users.find(x => x.id === actor.id && x.farmId === actor.farmId && x.active);
  const target = users.find(x => x.id === targetId);
  if (!caller) throw new Error('WITHDRAWAL_UNAUTHORIZED');
  if (!target || (caller.id !== target.id && !operatorEmail(caller.email))) throw new Error('WITHDRAWAL_TARGET_NOT_FOUND');
  let reason = '';
  const blocked = (message: string) => { if (!reason) reason = message; };
  if (operatorEmail(target.email)) blocked('運営者アカウントは、この画面から退会できません。');
  if (target.role !== 'owner') blocked('農場の代表アカウントと共有状態の確認が必要です。');
  if (target.farmId === 'farm-demo') blocked('旧共通データの確認が必要なため、この農場は個別対応になります。');
  if (users.some(x => x.id !== target.id && x.farmId === target.farmId)) blocked('この農場には他の利用者がいます。共有データを削除しないため、個別確認が必要です。');
  if (target.plan && target.plan !== 'free') blocked('有料プランの利用期間と契約状態を確認してください。契約終了後にFreeになってから退会を確定できます。');
  const bank = (await arrayAt(root, 'bank-transfer-applications.json')).filter(x => x.userId === target.id || x.farmId === target.farmId);
  for (const row of bank) {
    if (!['ended','expired'].includes(row.status) ||
      (row.status === 'ended' && (!Number.isFinite(Date.parse(row.contractEndsAt)) || Date.parse(row.contractEndsAt) > Date.now())) ||
      (row.status === 'expired' && row.activatedAt)) blocked('銀行振込の契約中・入金待ち・終了日時が未確認の申込があります。先に契約を確認してください。');
  }
  const stripe = [...await arrayAt(root, 'stripeSubscriptions.json'), ...await arrayAt(root, 'farms/farm-demo/stripeSubscriptions.json')].filter(x => x.userId === target.id);
  try { await stripeEnded(stripe); }
  catch { blocked('カード契約の終了と未処理の請求を確認できません。運営者がStripeで確認し、サーバーの確認設定を整えてから再確認してください。'); }
  const requests = await strictRead(root, 'withdrawal-requests.json', true);
  if (requests !== undefined && (!requests || requests.version !== 1 || !Array.isArray(requests.requests))) throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
  const ownRequests = (requests?.requests || []).filter((x: any) => x.userId === target.id);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ target, bank, stripe, requests: ownRequests })).digest('hex');
  return { caller, target, reason, fingerprint };
}
const publicUser = (user: FarmProUser) => ({ id: user.id, farmId: user.farmId, farmName: user.farmName, name: user.name, email: user.email });
export async function previewAccountWithdrawal(actor: Pick<AuthUser,'id'|'farmId'>, targetId: string) {
  if (!safeId(targetId)) throw new Error('WITHDRAWAL_TARGET_NOT_FOUND');
  return lifecycleLock(async root => {
    const state = await inspect(root, actor, targetId);
    const operations = await withdrawalCompletions(root);
    const existing = operations.find(x => x.userId === targetId);
    if (existing) return { user: publicUser(state.target), eligible: false, reason: '退会処理が開始済みです。処理結果を確認してください。', token: null };
    return { user: publicUser(state.target), eligible: !state.reason, reason: state.reason,
      token: state.reason ? null : sign({ id: crypto.randomUUID(), actorId: actor.id, userId: targetId, farmId: state.target.farmId, fingerprint: state.fingerprint, expiresAt: Date.now() + 5 * 60000 }),
      accountChanged: false, deleted: false };
  });
}
async function safeFarmTree(root: string, farmId: string) {
  // Refuse symlinks even in parents or descendants; never follow a path out of
  // this farm's dedicated directory. No legacy/shared source directory is used.
  async function check(target: string) {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
    if (stat.isDirectory()) for (const name of await fs.readdir(target)) await check(path.join(target, name));
  }
  const farms = path.join(root, 'farms');
  try {
    const parent = await fs.lstat(farms); if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
    await check(path.join(farms, farmId));
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
export function completionResult(operation: WithdrawalCompletion) {
  return { operationId: operation.id, userId: operation.userId, farmId: operation.farmId, status: operation.status,
    completedAt: operation.completedAt || null, accountClosed: true, serverDataDeleted: operation.status === 'completed', billingChanged: false };
}
async function finish(root: string, operation: WithdrawalCompletion) {
  await safeFarmTree(root, operation.farmId);
  await fs.rm(path.join(root, 'farms', operation.farmId), { force: true, recursive: true });
  const push = await strictRead(root, 'push-subscriptions.json', true);
  if (push !== undefined) {
    if (!push || !Array.isArray(push.subscriptions)) throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
    await atomicWrite(root, 'push-subscriptions.json', { ...push, subscriptions: push.subscriptions.filter((x: any) => x.userId !== operation.userId && x.farmId !== operation.farmId) });
  }
  const users = await usersAt(root);
  await atomicWrite(root, 'users.json', users.filter(x => x.id !== operation.userId));
  const requests = await strictRead(root, 'withdrawal-requests.json', true);
  if (requests !== undefined) {
    if (!requests || requests.version !== 1 || !Array.isArray(requests.requests)) throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
    await atomicWrite(root, 'withdrawal-requests.json', { ...requests, requests: requests.requests.map((x: any) => x.userId === operation.userId && x.status === 'pending' ? { ...x, status: 'completed', completedAt: new Date().toISOString() } : x) });
  }
  const operations = await withdrawalCompletions(root);
  const completed: WithdrawalCompletion = { ...operation, status: 'completed', completedAt: new Date().toISOString() };
  await saveCompletions(root, operations.map(x => x.id === operation.id ? completed : x));
  return completed;
}
export async function executeAccountWithdrawal(actor: Pick<AuthUser,'id'|'farmId'>, input: any) {
  if (!input || input.confirmed !== true || input.backupConfirmed !== true || typeof input.password !== 'string' || input.password.length > 512 ||
    typeof input.email !== 'string' || Object.keys(input).some(x => !['token','confirmed','backupConfirmed','consentConfirmed','password','email'].includes(x))) throw new Error('WITHDRAWAL_CONFIRMATION_INVALID');
  const value = proof(input.token);
  if (value.actorId !== actor.id) throw new Error('WITHDRAWAL_CONFIRMATION_INVALID');
  return withFarmRequest(value.farmId, () => lifecycleLock(async root => {
    const existing = (await withdrawalCompletions(root)).find(x => x.id === value.id && x.userId === value.userId && x.actorId === actor.id);
    if (existing) return completionResult(existing);
    const state = await inspect(root, actor, value.userId);
    if (state.reason) throw new Error('WITHDRAWAL_BLOCKED');
    if (state.fingerprint !== value.fingerprint || state.target.farmId !== value.farmId || input.email.trim().toLowerCase() !== state.target.email.trim().toLowerCase()) throw new Error('WITHDRAWAL_STATE_CHANGED');
    if (state.caller.id !== state.target.id && input.consentConfirmed !== true) throw new Error('WITHDRAWAL_CONFIRMATION_INVALID');
    const actual = crypto.scryptSync(input.password, state.caller.passwordSalt, 64);
    const expected = Buffer.from(state.caller.passwordHash, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error('WITHDRAWAL_PASSWORD_INVALID');
    await safeFarmTree(root, value.farmId);
    const operation: WithdrawalCompletion = { id: value.id, actorId: actor.id, userId: value.userId, farmId: value.farmId, startedAt: new Date().toISOString(), status: 'processing' };
    // The durable tombstone is committed first. It revokes every token and
    // prevents stale account/farm writes before physical cleanup starts.
    await saveCompletions(root, [...await withdrawalCompletions(root), operation]);
    try { return completionResult(await finish(root, operation)); }
    catch { return completionResult(operation); }
  }));
}
export async function accountWithdrawalResult(token: unknown) {
  const value = proof(token, true);
  const operation = (await withdrawalCompletions()).find(x => x.id === value.id && x.userId === value.userId && x.actorId === value.actorId);
  return operation ? completionResult(operation) : { status: 'not_started', accountClosed: false, serverDataDeleted: false };
}
export async function resumeAccountWithdrawals(operationId?: string) {
  for (const operation of await withdrawalCompletions()) {
    if (operation.status !== 'processing' || (operationId && operation.id !== operationId)) continue;
    await withFarmRequest(operation.farmId, () => lifecycleLock(async root => {
      const latest = (await withdrawalCompletions(root)).find(x => x.id === operation.id);
      if (latest?.status === 'processing') await finish(root, latest);
    })).catch(() => { /* Durable processing status remains visible; no account is revived. */ });
  }
}
