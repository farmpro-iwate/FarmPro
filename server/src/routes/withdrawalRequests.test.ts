import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { createPasswordHash, createToken, verifyToken, type AuthUser, type FarmProUser } from '../authStore';
import { requireAuth } from '../authMiddleware';
import { withdrawalRequestsRouter } from './withdrawalRequests';
import { getWithdrawalRequest, listWithdrawalRequests } from '../withdrawalRequestStore';

// No real account, credentials, mail or Stripe APIs. All writes are under mkdtemp.
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_OPERATOR_EMAILS', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
let previous: Record<string, string | undefined>;
let root: string;
let server: Server;
let origin: string;
let users: FarmProUser[];
const realFetch = globalThis.fetch;
const protectedPaths = ['users.json', 'bank-transfer-applications.json', 'stripeSubscriptions.json', 'farms/farm-owner/cattle.json', 'farms/farm-other/cattle.json'];
function safe(user: FarmProUser): AuthUser { const { passwordHash, passwordSalt, ...data } = user; return { ...data, plan: user.plan || 'free' }; }
async function put(file: string, value: unknown) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), JSON.stringify(value)); }
async function raw(file: string) { return fs.readFile(path.join(root, file), 'utf-8'); }
async function records() { return JSON.parse(await raw('withdrawal-requests.json')).requests; }
async function snapshot() { return Promise.all(protectedPaths.map(raw)); }
function payload(id = crypto.randomUUID(), timing = 'consult_first') { return { requestId: id, timing, confirmed: true }; }
async function call(route = '/me', body?: unknown, index = 1, method?: string) {
  return fetch(`${origin}/api/withdrawal-requests${route}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', ...(index < 0 ? {} : { Authorization: `Bearer ${createToken(safe(users[index]))}` }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(async () => {
  previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-withdrawal-intake-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_OPERATOR_EMAILS = 'operator@example.invalid';
  process.env.FARMPRO_AUTH_SECRET = 'fixture-intake-auth-secret';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('fixture-intake-password');
  users = ['operator', 'owner', 'other', 'member'].map((label) => ({
    id: `user-${label}`, farmId: `farm-${label}`, farmName: `${label} Farm`, name: 'Fixture Name', email: `${label}@example.invalid`,
    role: label === 'member' ? 'member' : 'owner', plan: label === 'other' ? 'pro' : 'free', active: true, ...credentials,
  }));
  await put('users.json', users);
  await put('bank-transfer-applications.json', [{ id: 'fixture-bank', userId: users[2].id, status: 'active' }]);
  await put('stripeSubscriptions.json', [{ subscriptionId: 'fixture-sub', userId: users[2].id, status: 'active' }]);
  await put('farms/farm-owner/cattle.json', [{ id: 'fixture-cow' }]);
  await put('farms/farm-other/cattle.json', [{ id: 'fixture-other-cow' }]);
  const app = express();
  app.use(express.json());
  app.use('/api/withdrawal-requests', requireAuth, withdrawalRequestsRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = async (input, init) => { assert.equal(new URL(String(input)).origin, origin); return realFetch(input, init); };
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert(root.startsWith(path.join(os.tmpdir(), 'farmpro-withdrawal-intake-')));
  await fs.rm(root, { recursive: true, force: true });
  for (const key of envKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
});

test('opening state and operator inbox are read-only and create no empty ledger', async () => {
  const before = await snapshot();
  const own = await call(); assert.equal(own.status, 200);
  const value = await own.json(); assert.equal(value.request, null); assert.equal(value.canRequest, true);
  assert.equal(value.deleted, false); assert.equal(value.billingChanged, false);
  assert.deepEqual(await (await call('/operator', undefined, 0)).json(), { requests: [], pendingCount: 0 });
  await assert.rejects(fs.stat(path.join(root, 'withdrawal-requests.json')), { code: 'ENOENT' });
  assert.deepEqual(await snapshot(), before);
});
test('confirmed wish persists only intake fields and leaves login plan and both farms unchanged', async () => {
  const before = await snapshot(); const body = payload(); const token = createToken(safe(users[1]));
  const response = await call('/me', body); assert.equal(response.status, 202);
  const state = await response.json();
  assert.equal(state.request.id, body.requestId); assert.equal(state.request.userId, users[1].id);
  assert.equal(state.request.email, users[1].email); assert.equal(state.request.status, 'pending');
  assert.equal(state.canRequest, false); assert.equal(state.accountChanged, false);
  assert.equal(await raw('withdrawal-requests.json').then((text) => text.includes(users[1].passwordHash)), false);
  assert.deepEqual(await snapshot(), before); assert(await verifyToken(token));
  assert.deepEqual((await getWithdrawalRequest(users[1])).request, state.request);
  assert.deepEqual((await (await call('/operator', undefined, 0)).json()).requests, [state.request]);
});
test('Free Standard and Pro can request advice without a downgrade or a contract expiry change', async () => {
  for (const plan of ['free', 'standard', 'pro'] as const) {
    users[1].plan = plan; await put('users.json', users);
    const before = await snapshot(); const body = payload(crypto.randomUUID(), 'after_paid_period');
    assert.equal((await call('/me', body)).status, 202);
    assert.equal((await records()).at(-1).planAtRequest, plan);
    assert.equal((await call('/me/cancel', { requestId: body.requestId, confirmed: true })).status, 200);
    assert.deepEqual(await snapshot(), before);
  }
});
test('concurrent duplicate delivery has one receipt and rejects a different pending request', async () => {
  const body = payload();
  const results = await Promise.all([call('/me', body), call('/me', body), call('/me', body)]);
  assert.deepEqual(results.map((row) => row.status).sort(), [200, 200, 202]);
  const states = await Promise.all(results.map((row) => row.json()));
  assert(states.every((row) => row.request.requestedAt === states[0].request.requestedAt));
  assert.equal((await records()).length, 1);
  assert.equal((await call('/me', payload())).status, 409);
});
test('query identity overrides cannot read other users and only operators can see the whole inbox', async () => {
  await call('/me', payload());
  const other = await (await call('/me?userId=user-owner', undefined, 2)).json();
  assert.equal(other.request, null); assert.equal(other.user.id, users[2].id);
  assert.equal((await call('/operator', undefined, 1)).status, 403);
  assert.equal((await call('/operator', undefined, -1)).status, 401);
  assert.equal((await call('/me', payload(), -1)).status, 401);
});
test('confirmation is required and caller identities force flags and invalid timing are rejected', async () => {
  for (const body of [null, [], {}, { ...payload(), confirmed: false }, { ...payload(), userId: 'user-other' },
    { ...payload(), farmId: 'farm-other' }, { ...payload(), email: 'other@example.invalid' },
    { ...payload(), force: true }, { ...payload(), timing: 'delete_now' }, { ...payload(), requestId: '../invalid' }]) {
    assert.equal((await call('/me', body)).status, 400);
  }
  await assert.rejects(fs.stat(path.join(root, 'withdrawal-requests.json')), { code: 'ENOENT' });
});
test('operator and member requests use the contact route rather than submitting account-wide wishes', async () => {
  for (const index of [0, 3]) {
    assert.equal((await (await call('/me', undefined, index)).json()).canRequest, false);
    assert.equal((await call('/me', payload(), index)).status, 403);
  }
});
test('cancelling preserves the record and changes neither login nor billing', async () => {
  const body = payload(); await call('/me', body); const before = await snapshot();
  const response = await call('/me/cancel', { requestId: body.requestId, confirmed: true });
  assert.equal(response.status, 200); const state = await response.json();
  assert.equal(state.request.status, 'cancelled'); assert.equal(state.canRequest, true);
  assert.equal(state.deleted, false); assert.equal(state.billingChanged, false);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await (await call('/operator', undefined, 0)).json()).pendingCount, 0);
});
test('old cancellation replay does not cancel a newer wish and old submission cannot reopen itself', async () => {
  const old = payload(); await call('/me', old);
  const cancel = { requestId: old.requestId, confirmed: true };
  await call('/me/cancel', cancel); const newer = payload(); await call('/me', newer);
  const state = await (await call('/me/cancel', cancel)).json();
  assert.equal(state.request.id, newer.requestId); assert.equal(state.request.status, 'pending');
  assert.equal((await call('/me', old)).status, 409);
});
test('another user cannot cancel a wish or reuse its receipt number', async () => {
  const body = payload(); await call('/me', body); const before = await raw('withdrawal-requests.json');
  assert.equal((await call('/me/cancel', { requestId: body.requestId, confirmed: true }, 2)).status, 404);
  assert.equal((await call('/me', body, 2)).status, 409);
  assert.equal(await raw('withdrawal-requests.json'), before);
});
test('stored current identity supplies the snapshot and later profile edits do not rewrite history', async () => {
  users[1].email = 'new@example.invalid'; await put('users.json', users);
  const body = payload(); await call('/me', body);
  users[1].email = 'later@example.invalid'; await put('users.json', users);
  const state = await (await call()).json();
  assert.equal(state.user.email, 'later@example.invalid'); assert.equal(state.request.email, 'new@example.invalid');
  assert.equal((await call('/me/cancel', { requestId: body.requestId, confirmed: true })).status, 200);
});
test('stopped accounts and removed operator access cannot use cached identities', async () => {
  const cached = safe(users[1]); users[1].active = false; await put('users.json', users);
  await assert.rejects(getWithdrawalRequest(cached), /WITHDRAWAL_UNAUTHORIZED/);
  process.env.FARMPRO_OPERATOR_EMAILS = 'different@example.invalid';
  await assert.rejects(listWithdrawalRequests(users[0]), /WITHDRAWAL_OPERATOR_REQUIRED/);
});
test('malformed stored data including JSON null is not treated as missing or overwritten', async () => {
  for (const text of ['null', '[]', '{}', '{broken', '{"version":1,"requests":[{}]}']) {
    await fs.writeFile(path.join(root, 'withdrawal-requests.json'), text);
    assert.equal((await call()).status, 503);
    assert.equal((await call('/me', payload())).status, 503);
    assert.equal(await raw('withdrawal-requests.json'), text);
  }
});
test('a symlink to another file never becomes an empty writable intake ledger', async () => {
  const target = path.join(root, 'elsewhere.json'); await fs.writeFile(target, '{"version":1,"requests":[]}');
  await fs.symlink(target, path.join(root, 'withdrawal-requests.json'));
  assert.equal((await call('/me', payload())).status, 503);
  assert.equal(await fs.readFile(target, 'utf-8'), '{"version":1,"requests":[]}');
});
test('publication failure does not claim acceptance and the same request can be retried', async (t) => {
  const body = payload(); const before = await snapshot();
  const rename = t.mock.method(fs, 'rename', async () => { throw new Error('fixture-publication-failure'); });
  assert.equal((await call('/me', body)).status, 503); assert.deepEqual(await snapshot(), before);
  rename.mock.restore();
  assert.equal((await call('/me', body)).status, 202); assert.equal((await records()).length, 1);
});
test('unknown response after publication can be resolved by read-only status and duplicate retry', async (t) => {
  const body = payload(); const actualRename = fs.rename.bind(fs);
  const rename = t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    await actualRename(...args); throw new Error('fixture-response-lost');
  });
  assert.equal((await call('/me', body)).status, 503);
  rename.mock.restore();
  assert.equal((await (await call()).json()).request.id, body.requestId);
  assert.equal((await call('/me', body)).status, 200); assert.equal((await records()).length, 1);
});
test('cancellation write failure keeps the wish pending for a confirmed retry', async (t) => {
  const body = payload(); await call('/me', body); const before = await raw('withdrawal-requests.json');
  const rename = t.mock.method(fs, 'rename', async () => { throw new Error('fixture-cancel-failure'); });
  const cancel = { requestId: body.requestId, confirmed: true };
  assert.equal((await call('/me/cancel', cancel)).status, 503);
  assert.equal(await raw('withdrawal-requests.json'), before);
  rename.mock.restore(); assert.equal((await call('/me/cancel', cancel)).status, 200);
});
test('application mounts intake after authentication and no alternate method executes a request', async () => {
  const source = await fs.readFile(new URL('../app.ts', import.meta.url), 'utf-8');
  assert(source.indexOf("app.use('/api', requireAuth)") < source.indexOf("app.use('/api/withdrawal-requests', withdrawalRequestsRouter)"));
  assert.equal((await call('/me', payload(), 1, 'DELETE')).status, 404);
  await assert.rejects(fs.stat(path.join(root, 'withdrawal-requests.json')), { code: 'ENOENT' });
});
