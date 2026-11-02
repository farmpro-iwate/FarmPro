import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { createPasswordHash, createToken, type AuthUser, type FarmProUser } from '../authStore';
import { requireAuth } from '../authMiddleware';
import { blvTestsRouter } from './blvTests';

// Real authentication and HTTP, restricted to disposable fixture farms.
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const farm = 'blv-http-fixture';
let temporaryDataDir = '';
let server: Server;
let origin = '';
let tokens: string[] = [];
const firstTime = '2026-11-01T00:00:00.000Z';
const input = (id: string) => ({
  id, cowEarTag: 'BLV-FIXTURE-COW', cowName: 'Fixture cow', testDate: '2026-11-02',
  result: '陰性', nextTestDate: '2027-05-02', isolationMemo: '', note: 'Original',
  createdAt: firstTime, updatedAt: firstTime, laboratory: { value: '001.20', units: ['fixture', null] },
});
type Row = ReturnType<typeof input> & { cloudUpdatedAt: string; deletedAt?: string };
const filePath = (name: string, selectedFarm = farm) => path.join(temporaryDataDir, 'farms', selectedFarm, name);
const bytes = (name = 'blv-tests-sync.json', selectedFarm = farm) => fs.readFile(filePath(name, selectedFarm), 'utf8');

before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-blv-http-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
  process.env.FARMPRO_AUTH_SECRET = 'blv-http-fixture-secret';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('blv-fixture-password');
  const users: FarmProUser[] = [
    { id: 'blv-paid-fixture', farmId: farm, plan: 'standard' as const },
    { id: 'blv-second-fixture', farmId: farm, plan: 'pro' as const },
    { id: 'blv-other-fixture', farmId: 'blv-other-farm-fixture', plan: 'pro' as const },
    { id: 'blv-free-fixture', farmId: 'blv-free-farm-fixture', plan: 'free' as const },
  ].map(user => ({ ...user, farmName: 'Fixture farm', name: 'Fixture user',
    email: `${user.id}@example.invalid`, role: 'owner', active: true, ...credentials }));
  await fs.writeFile(path.join(temporaryDataDir, 'users.json'), JSON.stringify(users));
  tokens = users.map(user => createToken(user as AuthUser));
  for (const selectedFarm of [farm, 'blv-other-farm-fixture', 'blv-free-farm-fixture']) {
    await fs.mkdir(path.dirname(filePath('blvTests.json', selectedFarm)), { recursive: true });
    await fs.writeFile(filePath('blvTests.json', selectedFarm), JSON.stringify([{ ...input('unused'), id: 42 }]));
  }
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/blv-tests', blvTestsRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

const syncPath = (id: string) => `/record-sync/${encodeURIComponent(id)}`;
const call = (route: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}, user = 0) =>
  fetch(origin + '/api/blv-tests' + route, {
    method, headers: { 'Content-Type': 'application/json', ...(user < 0 ? {} : { Authorization: `Bearer ${tokens[user]}` }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test('BLV sync requires paid authentication and keeps an empty sync read separate from legacy records', async () => {
  assert.equal((await call('/record-sync', 'GET', undefined, {}, -1)).status, 401);
  assert.equal((await call('/record-sync', 'GET', undefined, {}, 3)).status, 403);
  const legacy = await bytes('blvTests.json');
  const response = await call('/record-sync');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
  assert.equal((await call(syncPath('blv:missing'))).status, 404);
  await assert.rejects(fs.access(filePath('blv-tests-sync.json')), { code: 'ENOENT' });
  assert.equal(await bytes('blvTests.json'), legacy);
  assert.equal((await call('/42')).status, 200);
});

test('BLV mutation requires valid conditions and preserves unknown content without browser bookkeeping', async () => {
  const id = 'blv:conditions-fixture';
  const invalidConditions: Record<string, string>[] = [{ 'If-Match': '*' }, { 'If-Match': 'invalid' },
    { 'If-None-Match': 'invalid' }, { 'If-Match': firstTime, 'If-None-Match': '*' }];
  for (const method of ['PUT', 'DELETE']) {
    assert.equal((await call(syncPath(id), method, method === 'PUT' ? input(id) : undefined)).status, 428);
    for (const headers of invalidConditions) {
      assert.equal((await call(syncPath(id), method, method === 'PUT' ? input(id) : undefined, headers)).status, 400);
    }
  }
  const conditions = { 'If-None-Match': '*' };
  const created = await call(syncPath(id), 'PUT', {
    ...input(id), syncRecordId: 'browser-only', syncWarning: 'browser-warning', cloudSyncPending: true,
    blvSyncOrigin: { ownerId: 'browser-owner' }, blvSyncAttempt: { previous: true },
  }, conditions);
  assert.equal(created.status, 200);
  const saved = await created.json() as Row;
  assert.deepEqual(saved.laboratory, input(id).laboratory);
  assert.equal(saved.updatedAt, firstTime);
  for (const key of ['syncRecordId', 'syncWarning', 'cloudSyncPending', 'blvSyncOrigin', 'blvSyncAttempt']) {
    assert.equal(key in saved, false);
  }
  const before = await bytes();
  assert.equal((await call(syncPath(id), 'PUT', input(id), conditions)).status, 412);
  assert.equal((await call(syncPath(id), 'DELETE', undefined, conditions)).status, 412);
  for (const body of [[], { ...input(id), id: 'blv:other-id' }, ...['', null, false, firstTime].map(deletedAt => ({ ...input(id), deletedAt }))]) {
    assert.equal((await call(syncPath(id), 'PUT', body, { 'If-Match': saved.cloudUpdatedAt })).status, 400);
  }
  assert.equal(await bytes(), before);
});

test('BLV exact PUT and DELETE replays retain their revisions, tombstones and authenticated farm boundary', async () => {
  const id = 'blv:lost-ack-fixture';
  const created = await call(syncPath(id), 'PUT', input(id), { 'If-None-Match': '*' });
  assert.equal(created.status, 200);
  const original = await created.json() as Row;
  const request = { ...input(id), note: 'Committed once', updatedAt: '2026-11-02T00:00:00.000Z' };
  const conditions = { 'If-Match': JSON.stringify(original.cloudUpdatedAt) };
  const editedResponse = await call(syncPath(id), 'PUT', request, conditions, 1);
  assert.equal(editedResponse.status, 200);
  const edited = await editedResponse.json() as Row;
  const before = await bytes();
  const replay = await call(syncPath(id), 'PUT', request, conditions);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), edited);
  assert.equal((await call(syncPath(id), 'PUT', { ...request, laboratory: { value: '1.20' } }, conditions)).status, 412);
  assert.equal((await call(syncPath(id), 'DELETE', undefined, conditions)).status, 412);
  assert.deepEqual(await (await call(syncPath(id))).json(), edited);
  assert.equal(await bytes(), before);
  assert.equal((await call(syncPath(id), 'GET', undefined, {}, 2)).status, 404);
  const other = await call(syncPath(id), 'PUT', { ...input(id), note: 'Other farm' }, { 'If-None-Match': '*' }, 2);
  assert.equal(other.status, 200);
  assert.equal(await bytes(), before);

  const deletion = await call(syncPath(id), 'DELETE', undefined, { 'If-Match': edited.cloudUpdatedAt });
  assert.equal(deletion.status, 200);
  const deleted = await deletion.json() as Row;
  assert.ok(deleted.deletedAt);
  assert.deepEqual(deleted.laboratory, input(id).laboratory);
  const deletedBytes = await bytes();
  const deleteReplay = await call(syncPath(id), 'DELETE', undefined, { 'If-Match': edited.cloudUpdatedAt });
  assert.equal(deleteReplay.status, 200);
  assert.deepEqual(await deleteReplay.json(), deleted);
  assert.equal((await call(syncPath(id), 'PUT', request, { 'If-Match': deleted.cloudUpdatedAt })).status, 409);
  assert.equal((await call(syncPath(id), 'PUT', request, { 'If-None-Match': '*' })).status, 412);
  const listed = await (await call('/record-sync')).json() as Row[];
  assert.deepEqual(listed.find(row => row.id === id), deleted);
  assert.deepEqual(await (await call(syncPath(id))).json(), deleted);
  assert.equal(await bytes(), deletedBytes);
  assert.equal((await (await call(syncPath(id), 'GET', undefined, {}, 2)).json() as Row).note, 'Other farm');
});

test('BLV concurrent edits and deletion cannot consume the same live revision twice', async () => {
  for (const deleting of [false, true]) {
    const id = `blv:concurrent-${deleting}`;
    const created = await call(syncPath(id), 'PUT', input(id), { 'If-None-Match': '*' });
    assert.equal(created.status, 200);
    const original = await created.json() as Row;
    const conditions = { 'If-Match': original.cloudUpdatedAt };
    const outcomes = await Promise.all([
      call(syncPath(id), 'PUT', { ...input(id), note: 'First device edit' }, conditions),
      deleting ? call(syncPath(id), 'DELETE', undefined, conditions, 1)
        : call(syncPath(id), 'PUT', { ...input(id), note: 'Second device edit' }, conditions, 1),
    ]);
    assert.equal(outcomes.filter(response => response.status === 200).length, 1);
    assert.equal(outcomes.filter(response => response.status === 412 || response.status === 409).length, 1);
  }
});
