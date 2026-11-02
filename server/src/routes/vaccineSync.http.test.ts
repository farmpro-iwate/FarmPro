import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { runWithFarm } from '../farmContext';
import { vaccinesRouter } from './vaccines';
import type { SyncedVaccineRecord } from '../vaccineSyncStore';

// Exercise the route and its real JSON store in one disposable farm. This
// harness never starts app.ts, background jobs or any external connection.
const previousDataDir = process.env.FARMPRO_DATA_DIR;
const farm = 'vaccine-http-fixture';
let temporaryDataDir = '';
let server: Server;
let origin = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-vaccine-http-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
  const app = express();
  app.use(express.json());
  app.use('/api/vaccines', (_req, _res, next) => runWithFarm(farm, next), vaccinesRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

const input = (id: string) => ({
  id, targetType: '成牛', targetNumber: 'FIXTURE-COW', targetName: 'Fixture cow',
  vaccineName: 'Fixture vaccine', vaccineCost: '1200', vaccinationDate: '',
  nextDueDate: '2026-11-09', status: '未接種', note: 'Original',
  createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
});
const recordPath = (id: string) => `/api/vaccines/record-sync/${encodeURIComponent(id)}`;
const call = (id: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => fetch(origin + recordPath(id), {
  method, headers: { 'Content-Type': 'application/json', ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const bytes = () => fs.readFile(path.join(temporaryDataDir, 'farms', farm, 'vaccines-sync.json'), 'utf8');

test('HTTP forwards revision conditions, preserves readback, and reports stale writes without mutating data', async () => {
  const id = 'vaccine:conditional-http-fixture';
  const create = await call(id, 'PUT', input(id), { 'If-None-Match': '*' });
  assert.equal(create.status, 200);
  const original = await create.json() as SyncedVaccineRecord;
  assert.ok(original.cloudUpdatedAt);
  const read = await call(id);
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), original);
  const listed = await fetch(origin + '/api/vaccines/record-sync');
  assert.equal(listed.status, 200);
  assert.equal((await listed.json() as SyncedVaccineRecord[]).find(row => row.id === id)?.cloudUpdatedAt, original.cloudUpdatedAt);

  const request = { ...original, note: 'Accepted edit', updatedAt: '2026-11-02T01:00:00.000Z' };
  const matching = { 'If-Match': JSON.stringify(original.cloudUpdatedAt) };
  const edit = await call(id, 'PUT', request, matching);
  assert.equal(edit.status, 200);
  const edited = await edit.json() as SyncedVaccineRecord;
  const beforeRejected = await bytes();
  const repeated = await call(id, 'PUT', request, matching);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json() as SyncedVaccineRecord).cloudUpdatedAt, edited.cloudUpdatedAt);
  assert.equal((await call(id, 'PUT', { ...request, note: 'Rejected stale edit' }, matching)).status, 412);
  assert.equal((await call(id, 'DELETE', undefined, matching)).status, 412);
  assert.equal((await call(id, 'PUT', input(id), { ...matching, 'If-None-Match': '*' })).status, 400);
  assert.equal(await bytes(), beforeRejected);

  const remove = await call(id, 'DELETE', undefined, { 'If-Match': JSON.stringify(edited.cloudUpdatedAt) });
  assert.equal(remove.status, 200);
  const deleted = await remove.json() as SyncedVaccineRecord;
  assert.ok(deleted.deletedAt);
  const beforeRetry = await bytes();
  const retryDelete = await call(id, 'DELETE', undefined, matching);
  assert.equal(retryDelete.status, 200);
  assert.deepEqual(await retryDelete.json(), deleted);
  assert.equal((await call(id, 'PUT', input(id))).status, 409);
  assert.deepEqual(await (await call(id)).json(), deleted);
  assert.equal(await bytes(), beforeRetry);
  assert.equal((await call('vaccine:missing-http-fixture')).status, 404);
});

test('HTTP conditional absence deletion cannot erase a concurrent creation and prevents delayed recreation', async () => {
  const id = 'vaccine:delete-create-http-fixture';
  assert.equal((await call(id)).status, 404);
  assert.equal((await call(id, 'PUT', input(id), { 'If-None-Match': '*' })).status, 200);
  const before = await bytes();
  assert.equal((await call(id, 'DELETE', undefined, { 'If-None-Match': '*' })).status, 412);
  assert.equal(await bytes(), before);

  const absentId = 'vaccine:delete-absent-http-fixture';
  const removed = await call(absentId, 'DELETE', undefined, { 'If-None-Match': '*' });
  assert.equal(removed.status, 200);
  const tombstone = await removed.json() as SyncedVaccineRecord;
  assert.ok(tombstone.deletedAt);
  const tombstoneBytes = await bytes();
  const retry = await call(absentId, 'DELETE', undefined, { 'If-None-Match': '*' });
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), tombstone);
  assert.equal((await call(absentId, 'PUT', input(absentId), { 'If-None-Match': '*' })).status, 412);
  assert.equal((await call(absentId, 'PUT', input(absentId))).status, 409);
  assert.equal(await bytes(), tombstoneBytes);
});
