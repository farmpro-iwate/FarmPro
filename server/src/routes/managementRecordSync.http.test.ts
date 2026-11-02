import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { createPasswordHash, createToken, type AuthUser, type FarmProUser } from '../authStore';
import { requireAuth } from '../authMiddleware';

// Even the old global route resolves inside this temporary cwd. No test reads
// or writes the repository's src/data file or any existing farm.
const previousCwd = process.cwd();
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const farm = 'management-http-fixture';
let root = '';
let server: Server;
let origin = '';
let tokens: string[] = [];
let protectedBefore: string[] = [];
const protectedFiles = ['src/data/feedingAlertActions.json', 'runtime/users.json',
  'runtime/stripeSubscriptions.json', 'runtime/bank-transfer-applications.json',
  `runtime/farms/${farm}/cattle.json`, `runtime/farms/${farm}/calves.json`,
  `runtime/farms/${farm}/expenses-sync.json`, `runtime/farms/${farm}/schedules-sync.json`];
const raw = (file: string) => fs.readFile(path.join(root, file), 'utf8');
async function put(file: string, value: unknown) {
  const destination = path.join(root, file);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(value));
}
const firstTime = '2026-11-01T00:00:00.000Z';
const fixture = (id: string) => ({
  id, actionDate: '2026-11-02', calfId: 'FIXTURE-CALF', calfName: 'Fixture calf', ageDays: '012',
  alertType: 'Fixture alert', actionType: 'Fixture action', memo: 'Original', nextCheckDate: '', status: '未対応',
  createdAt: firstTime, updatedAt: firstTime, extension: { amount: '001.20', nested: ['fixture', null] },
});
const syncPath = (id?: string) => '/api/feeding-alert-actions/record-sync' + (id ? `/${encodeURIComponent(id)}` : '');
const call = (route: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}, user = 0) =>
  fetch(origin + route, { method, headers: { 'Content-Type': 'application/json',
    ...(user < 0 ? {} : { Authorization: `Bearer ${tokens[user]}` }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-management-http-'));
  process.chdir(root);
  process.env.FARMPRO_DATA_DIR = path.join(root, 'runtime');
  process.env.FARMPRO_AUTH_SECRET = 'management-http-fixture-secret';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('management-fixture-password');
  const users: FarmProUser[] = [
    { id: 'management-paid-fixture', farmId: farm, plan: 'standard' as const },
    { id: 'management-second-fixture', farmId: farm, plan: 'pro' as const },
    { id: 'management-other-fixture', farmId: 'management-other-farm', plan: 'pro' as const },
    { id: 'management-free-fixture', farmId: 'management-free-farm', plan: 'free' as const },
  ].map(user => ({ ...user, farmName: 'Fixture farm', name: 'Fixture user',
    email: `${user.id}@example.invalid`, role: 'owner', active: true, ...credentials }));
  tokens = users.map(user => createToken(user as AuthUser));
  await put('runtime/users.json', users);
  for (const file of protectedFiles.filter(file => file !== 'runtime/users.json')) {
    await put(file, [{ id: 'global-or-unrelated-fixture', marker: 'must remain unchanged' }]);
  }
  protectedBefore = await Promise.all(protectedFiles.map(raw));
  const { feedingAlertActionsRouter } = await import('./feedingAlertActions');
  const { fatteningTransitionsRouter } = await import('./fatteningTransitions');
  const { reportsRouter } = await import('./reports');
  const app = express();
  app.use(express.json()); app.use('/api', requireAuth);
  app.use('/api/feeding-alert-actions', feedingAlertActionsRouter);
  app.use('/api/fattening-transitions', fatteningTransitionsRouter);
  app.use('/api/reports', reportsRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { assert.deepEqual(await Promise.all(protectedFiles.map(raw)), protectedBefore); });
after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  try { assert.deepEqual(await Promise.all(protectedFiles.map(raw)), protectedBefore); }
  finally {
    process.chdir(previousCwd);
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    if (root) await fs.rm(root, { recursive: true, force: true });
  }
});

test('new feeding action sync is paid, farm-scoped and never adopts the old global file', async () => {
  assert.equal((await call(syncPath(), 'GET', undefined, {}, -1)).status, 401);
  assert.equal((await call(syncPath(), 'GET', undefined, {}, 3)).status, 403);
  const response = await call(syncPath());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
  await assert.rejects(fs.access(path.join(root, 'runtime', 'farms', farm, 'feeding-alert-actions-sync.json')), { code: 'ENOENT' });
  assert.deepEqual(await (await call('/api/feeding-alert-actions')).json(), [{ id: 'global-or-unrelated-fixture', marker: 'must remain unchanged' }]);
});

test('feeding action HTTP forwards mandatory conditions, exact replay and tombstones without rewriting other ledgers', async () => {
  const id = 'feeding-http-fixture';
  assert.equal((await call(syncPath(id), 'PUT', fixture(id))).status, 428);
  assert.equal((await call(syncPath(id), 'DELETE')).status, 428);
  assert.equal((await call(syncPath(id), 'PUT', fixture(id), { 'If-Match': '*' })).status, 400);
  const created = await call(syncPath(id), 'PUT', fixture(id), { 'If-None-Match': '*' });
  assert.equal(created.status, 200);
  const original = await created.json() as Record<string, unknown>;
  const request = { ...fixture(id), memo: 'Updated once', extension: null };
  const headers = { 'If-Match': JSON.stringify(original.cloudUpdatedAt) };
  const update = await call(syncPath(id), 'PUT', request, headers, 1);
  assert.equal(update.status, 200);
  const updated = await update.json() as Record<string, unknown>;
  const file = `runtime/farms/${farm}/feeding-alert-actions-sync.json`;
  const before = await raw(file);
  const replay = await call(syncPath(id), 'PUT', request, headers);
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), updated);
  assert.equal((await call(syncPath(id), 'PUT', { ...request, memo: 'Stale' }, headers)).status, 412);
  assert.equal((await call(syncPath(id), 'DELETE', undefined, headers)).status, 412);
  assert.equal((await call(syncPath(id), 'PUT', request, { 'If-None-Match': '*' })).status, 412);
  assert.equal((await call(syncPath(id), 'GET', undefined, {}, 2)).status, 404);
  assert.equal(await raw(file), before);
  const deletion = await call(syncPath(id), 'DELETE', undefined, { 'If-Match': String(updated.cloudUpdatedAt) });
  assert.equal(deletion.status, 200);
  const deleted = await deletion.json() as Record<string, unknown>;
  assert.ok(deleted.deletedAt);
  const deletedBytes = await raw(file);
  const deleteReplay = await call(syncPath(id), 'DELETE', undefined, { 'If-Match': String(updated.cloudUpdatedAt) });
  assert.equal(deleteReplay.status, 200); assert.deepEqual(await deleteReplay.json(), deleted);
  assert.equal((await call(syncPath(id), 'PUT', fixture(id), { 'If-Match': String(deleted.cloudUpdatedAt) })).status, 409);
  assert.equal((await call(syncPath(id), 'PUT', fixture(id), { 'If-None-Match': '*' })).status, 412);
  assert.deepEqual(await (await call(syncPath(id))).json(), deleted);
  assert.equal(await raw(file), deletedBytes);
});

test('fattening HTTP isolates farms and prevents competing active identities without merging their IDs', async () => {
  const endpoint = (id?: string) => '/api/fattening-transitions/record-sync' + (id ? `/${id}` : '');
  const body = (id: string, status = '肥育中') => ({
    id, targetNumber: '  FATTENING-HTTP-FIXTURE  ', targetName: 'Fixture animal', status,
    startDate: '2026-11-02', memo: 'Original', extension: { amount: '001.20' }, createdAt: firstTime, updatedAt: firstTime,
  });
  assert.equal((await call(endpoint(), 'GET', undefined, {}, -1)).status, 401);
  assert.equal((await call(endpoint(), 'GET', undefined, {}, 3)).status, 403);
  assert.deepEqual(await (await call(endpoint())).json(), []);
  await assert.rejects(fs.access(path.join(root, 'runtime', 'farms', farm, 'fattening-transitions-sync.json')), { code: 'ENOENT' });
  assert.equal((await call(endpoint('first'), 'PUT', body('first'))).status, 428);
  assert.equal((await call(endpoint('first'), 'DELETE')).status, 428);
  assert.equal((await call(endpoint('first'), 'PUT', body('first'), { 'If-None-Match': 'bad' })).status, 400);
  const create = { 'If-None-Match': '*' };
  const outcomes = await Promise.all([
    call(endpoint('first'), 'PUT', body('first'), create),
    call(endpoint('second'), 'PUT', { ...body('second'), targetNumber: 'FATTENING-HTTP-FIXTURE' }, create, 1),
  ]);
  assert.deepEqual(outcomes.map(response => response.status).sort(), [200, 409]);
  const winner = await outcomes.find(response => response.status === 200)!.json() as Record<string, unknown>;
  const file = `runtime/farms/${farm}/fattening-transitions-sync.json`;
  const before = await raw(file);
  assert.equal((await call(endpoint('archived-new-id'), 'PUT', body('archived-new-id', '出荷済み'), create)).status, 409);
  assert.equal((await call(endpoint(String(winner.id)), 'PUT', winner, create)).status, 412);
  assert.equal((await call(endpoint(String(winner.id)), 'GET', undefined, {}, 2)).status, 404);
  const other = await call(endpoint(String(winner.id)), 'PUT', body(String(winner.id)), create, 2);
  assert.equal(other.status, 200);
  assert.equal(await raw(file), before);

  const changed = { ...winner, memo: null, extension: null };
  const condition = { 'If-Match': String(winner.cloudUpdatedAt) };
  const update = await call(endpoint(String(winner.id)), 'PUT', changed, condition);
  assert.equal(update.status, 200);
  const saved = await update.json() as Record<string, unknown>;
  assert.equal(saved.memo, null); assert.equal(saved.extension, null);
  const updatedBytes = await raw(file);
  const replay = await call(endpoint(String(winner.id)), 'PUT', changed, condition);
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), saved);
  assert.equal(await raw(file), updatedBytes);
  const deletion = await call(endpoint(String(winner.id)), 'DELETE', undefined, { 'If-Match': String(saved.cloudUpdatedAt) });
  assert.equal(deletion.status, 200);
  const deleted = await deletion.json() as Record<string, unknown>;
  assert.equal((await call(endpoint(String(winner.id)), 'PUT', body(String(winner.id)), { 'If-Match': String(deleted.cloudUpdatedAt) })).status, 409);
  const replacement = await call(endpoint('replacement-id'), 'PUT', body('replacement-id'), create);
  assert.equal(replacement.status, 200);
  const listed = await (await call(endpoint())).json() as Array<Record<string, unknown>>;
  assert.equal(listed.filter(record => !record.deletedAt).length, 1);
  assert.equal(listed.find(record => record.id === winner.id)?.deletedAt, deleted.deletedAt);
});

test('feeding reports use only authenticated farm records and exclude explicit tombstones and global legacy rows', async () => {
  const legacy = [
    { ...fixture('report-updated'), memo: 'Stale legacy memo' }, fixture('report-deleted'), fixture('report-legacy-only'),
  ];
  await put(`runtime/farms/${farm}/feedingAlertActions.json`, legacy);
  await put('runtime/farms/management-other-farm/feedingAlertActions.json', [fixture('other-farm-only')]);
  assert.equal((await call(syncPath('report-updated'), 'PUT', { ...fixture('report-updated'), status: '対応済み' }, { 'If-None-Match': '*' })).status, 200);
  assert.equal((await call(syncPath('report-deleted'), 'DELETE', undefined, { 'If-None-Match': '*' })).status, 200);
  assert.equal((await call(syncPath('report-new'), 'PUT', { ...fixture('report-new'), status: '再確認必要' }, { 'If-None-Match': '*' })).status, 200);
  const files = [`runtime/farms/${farm}/feedingAlertActions.json`, `runtime/farms/${farm}/feeding-alert-actions-sync.json`,
    'runtime/farms/management-other-farm/feedingAlertActions.json'];
  const before = await Promise.all(files.map(raw));
  const report = await (await call('/api/reports/summary')).json() as {
    feedingAlertActions: { totalCount: number; doneCount: number; recheckCount: number };
    feedingAlertActionDueAlerts: { details: Array<{ id: string }> };
  };
  assert.equal(report.feedingAlertActions.totalCount, 3);
  assert.equal(report.feedingAlertActions.doneCount, 1);
  assert.equal(report.feedingAlertActions.recheckCount, 1);
  assert.deepEqual(report.feedingAlertActionDueAlerts.details.map(record => record.id).sort(), ['report-legacy-only', 'report-new']);
  const other = await (await call('/api/reports/summary', 'GET', undefined, {}, 2)).json() as typeof report;
  assert.equal(other.feedingAlertActions.totalCount, 1);
  assert.deepEqual(other.feedingAlertActionDueAlerts.details.map(record => record.id), ['other-farm-only']);
  assert.deepEqual(await Promise.all(files.map(raw)), before);
});
