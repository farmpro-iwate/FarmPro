import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { runWithFarm } from '../farmContext';
import type { SyncedTreatmentRecord } from '../treatmentSyncStore';
import { treatmentsRouter } from './treatments';

// Local HTTP + temporary fixture ledgers only; no app.ts jobs or external services.
const previousDataDir = process.env.FARMPRO_DATA_DIR;
const farm = 'treatment-http-fixture';
let temporaryDataDir = '';
let server: Server;
let origin = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-treatment-http-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
  const app = express();
  app.use(express.json());
  app.use('/api/treatments', (_req, _res, next) => runWithFarm(farm, next), treatmentsRouter);
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
  id, targetNumber: 'FIXTURE-COW', targetName: 'Fixture cow', symptom: 'Fixture symptom',
  treatmentDate: '2026-11-02', medicineCost: '01200', medicalFee: '800', note: 'Original',
  createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
  unknownBusiness: { exactCost: '00120.50' },
});
const call = (route: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => fetch(origin + '/api/treatments' + route, {
  method, headers: { 'Content-Type': 'application/json', ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const syncPath = (id: string) => `/record-sync/${encodeURIComponent(id)}`;
const bytes = (fileName = 'treatments-sync.json') => fs.readFile(path.join(temporaryDataDir, 'farms', farm, fileName), 'utf8');

test('HTTP forwards treatment preconditions, supports exact replay and preserves the tombstone JSON contract', async () => {
  const id = 'treatment:conditional-http-fixture';
  const create = await call(syncPath(id), 'PUT', {
    ...input(id), syncRecordId: 'local-alias', cloudSyncPending: true, treatmentSyncBase: { local: true },
  }, { 'If-None-Match': '*' });
  assert.equal(create.status, 200);
  const original = await create.json() as SyncedTreatmentRecord;
  assert.ok(original.cloudUpdatedAt);
  assert.equal('syncRecordId' in original, false);
  assert.equal('cloudSyncPending' in original, false);
  assert.equal('treatmentSyncBase' in original, false);
  assert.deepEqual(await (await call(syncPath(id))).json(), original);
  const request = { ...original, note: 'Newer edit', updatedAt: '2026-11-02T01:00:00.000Z' };
  const conditions = { 'If-Match': JSON.stringify(original.cloudUpdatedAt) };
  const editedResponse = await call(syncPath(id), 'PUT', request, conditions);
  assert.equal(editedResponse.status, 200);
  const edited = await editedResponse.json() as SyncedTreatmentRecord;
  const before = await bytes();
  const repeated = await call(syncPath(id), 'PUT', request, conditions);
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), edited);
  assert.equal((await call(syncPath(id), 'PUT', { ...request, note: 'Stale edit' }, conditions)).status, 412);
  assert.equal((await call(syncPath(id), 'DELETE', undefined, conditions)).status, 412);
  assert.equal((await call(syncPath(id), 'PUT', request, { ...conditions, 'If-None-Match': '*' })).status, 400);
  assert.equal((await call(syncPath(id), 'DELETE', undefined, { 'If-None-Match': 'invalid' })).status, 400);
  assert.equal((await call(syncPath(id), 'PUT', [], conditions)).status, 400);
  for (const deletedAt of ['', null, false, '2026-11-02T02:00:00.000Z']) {
    assert.equal((await call(syncPath(id), 'PUT', { ...request, deletedAt })).status, 400);
  }
  assert.equal(await bytes(), before);

  const deletedResponse = await call(syncPath(id), 'DELETE', undefined, { 'If-Match': edited.cloudUpdatedAt! });
  assert.equal(deletedResponse.status, 200);
  const deleted = await deletedResponse.json() as SyncedTreatmentRecord;
  assert.ok(deleted.deletedAt);
  assert.equal(deleted.medicineCost, '01200');
  assert.equal(deleted.medicalFee, '800');
  assert.deepEqual((deleted as Record<string, unknown>).unknownBusiness, input(id).unknownBusiness);
  const deletedBytes = await bytes();
  const repeatedDelete = await call(syncPath(id), 'DELETE', undefined, conditions);
  assert.equal(repeatedDelete.status, 200);
  assert.deepEqual(await repeatedDelete.json(), deleted);
  assert.deepEqual(await (await call(syncPath(id))).json(), deleted);
  const listed = await (await call('/record-sync')).json() as SyncedTreatmentRecord[];
  assert.deepEqual(listed.find(record => record.id === id), deleted);
  assert.equal((await call(syncPath(id), 'PUT', input(id))).status, 409);
  assert.equal((await call(syncPath(id), 'PUT', input(id), { 'If-None-Match': '*' })).status, 412);
  assert.equal(await bytes(), deletedBytes);
});

test('HTTP absence deletion is conditional and keeps the independent legacy treatment ledger unchanged', async () => {
  const normal = await call('', 'POST', input('ignored-local-id'));
  assert.equal(normal.status, 201);
  const legacy = await normal.json() as { id: number };
  const legacyBytes = await bytes('treatments.json');

  const id = 'treatment:missing-http-fixture';
  assert.equal((await call(syncPath(id))).status, 404);
  const deletedResponse = await call(syncPath(id), 'DELETE', undefined, { 'If-None-Match': '*' });
  assert.equal(deletedResponse.status, 200);
  const deleted = await deletedResponse.json() as SyncedTreatmentRecord;
  assert.ok(deleted.deletedAt);
  assert.equal((await call(syncPath(id), 'PUT', input(id))).status, 409);
  assert.equal((await call(syncPath(id), 'PUT', input(id), { 'If-None-Match': '*' })).status, 412);
  const legacyMissingDelete = await call(syncPath('treatment:legacy-missing-http'), 'DELETE');
  assert.equal(legacyMissingDelete.status, 200);
  assert.ok((await legacyMissingDelete.json() as SyncedTreatmentRecord).deletedAt);

  const concurrent = 'treatment:created-after-get-http';
  assert.equal((await call(syncPath(concurrent))).status, 404);
  const created = await call(syncPath(concurrent), 'PUT', input(concurrent), { 'If-None-Match': '*' });
  assert.equal(created.status, 200);
  const before = await bytes();
  assert.equal((await call(syncPath(concurrent), 'DELETE', undefined, { 'If-None-Match': '*' })).status, 412);
  assert.equal(await bytes(), before);
  assert.equal((await (await call(syncPath(concurrent))).json() as SyncedTreatmentRecord).note, 'Original');
  assert.equal(await bytes('treatments.json'), legacyBytes);
  assert.equal((await call(`/${legacy.id}`)).status, 200);
  const normalList = await (await call('')).json() as Array<{ id: number }>;
  assert.deepEqual(normalList.map(record => record.id), [legacy.id]);
});
