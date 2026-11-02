import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { runWithFarm } from '../farmContext';
import { breedingsRouter } from './breedings';
import type { Breeding } from '../breedingStore';

// Local router + real JSON store only. No app.ts jobs, production data or external requests.
const previousDataDir = process.env.FARMPRO_DATA_DIR;
const farm = 'breeding-http-fixture';
let temporaryDataDir = '';
let server: Server;
let origin = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-breeding-http-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
  const app = express();
  app.use(express.json());
  app.use('/api/breedings', (_req, _res, next) => runWithFarm(farm, next), breedingsRouter);
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
  id, cowEarTag: 'FIXTURE-COW', cowName: 'Fixture cow', breedingMethod: '未選択',
  breedingStatus: '発情予定', note: 'Original',
  createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
});
const call = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => fetch(origin + '/api/breedings' + path, {
  method, headers: { 'Content-Type': 'application/json', ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const syncPath = (id: string) => `/record-sync/${encodeURIComponent(id)}`;
const normalPath = (id: string) => `/${encodeURIComponent(id)}`;
const bytes = () => fs.readFile(path.join(temporaryDataDir, 'farms', farm, 'breedings.json'), 'utf8');

test('HTTP preserves live readbacks, forwards conditions and hides tombstones without losing delete replay protection', async () => {
  const id = 'breeding-conditional-http-fixture';
  const create = await call(syncPath(id), 'PUT', input(id), { 'If-None-Match': '*' });
  assert.equal(create.status, 200);
  const original = await create.json() as Breeding;
  assert.ok(original.cloudUpdatedAt);
  assert.deepEqual(await (await call(syncPath(id))).json(), original);
  assert.deepEqual(await (await call(normalPath(id))).json(), original);
  const request = { ...original, note: 'Newer cloud edit', updatedAt: '2026-11-02T01:00:00.000Z' };
  const matching = { 'If-Match': JSON.stringify(original.cloudUpdatedAt) };
  const edit = await call(syncPath(id), 'PUT', request, matching);
  assert.equal(edit.status, 200);
  const edited = await edit.json() as Breeding;
  const before = await bytes();
  const repeated = await call(syncPath(id), 'PUT', request, matching);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json() as Breeding).cloudUpdatedAt, edited.cloudUpdatedAt);
  assert.equal((await call(syncPath(id), 'PUT', { ...request, note: 'Rejected stale edit' }, matching)).status, 412);
  assert.equal((await call(normalPath(id), 'PUT', { ...request, note: 'Rejected legacy route edit' }, matching)).status, 412);
  assert.equal((await call(normalPath(id), 'DELETE', undefined, matching)).status, 412);
  assert.equal((await call(syncPath(id), 'PUT', request, { ...matching, 'If-None-Match': '*' })).status, 400);
  assert.equal((await call(syncPath(id), 'PUT', [], matching)).status, 400);
  assert.equal((await call(syncPath(id), 'PUT', { ...request, deletedAt: '2026-11-02T02:00:00.000Z' })).status, 400);
  assert.equal(await bytes(), before);

  assert.equal((await call(normalPath(id), 'DELETE', undefined, { 'If-Match': edited.cloudUpdatedAt! })).status, 204);
  const tombstone = await (await call(syncPath(id))).json() as Breeding;
  assert.ok(tombstone.deletedAt);
  const deletedBytes = await bytes();
  assert.equal((await call(normalPath(id), 'DELETE', undefined, matching)).status, 204);
  assert.equal((await call(syncPath(id), 'PUT', input(id))).status, 409);
  assert.equal((await call(normalPath(id), 'PUT', input(id))).status, 409);
  assert.equal((await call(normalPath(id))).status, 404);
  for (const listPath of ['', '/record-sync']) {
    const listed = await (await call(listPath)).json() as Breeding[];
    assert.equal(listed.some(record => String(record.id) === id), false);
  }
  assert.equal(await bytes(), deletedBytes);
});

test('HTTP conditional absence deletion stamps missing IDs and rejects a creation made after its read', async () => {
  const missing = 'breeding-absent-http-fixture';
  assert.equal((await call(syncPath(missing))).status, 404);
  assert.equal((await call(normalPath(missing), 'DELETE')).status, 404);
  assert.equal((await call(normalPath(missing), 'DELETE', undefined, { 'If-None-Match': '*' })).status, 204);
  const deleted = await (await call(syncPath(missing))).json() as Breeding;
  assert.ok(deleted.deletedAt);
  assert.equal((await call(syncPath(missing), 'PUT', input(missing), { 'If-None-Match': '*' })).status, 412);
  assert.equal((await call(syncPath(missing), 'PUT', input(missing))).status, 409);

  const concurrent = 'breeding-concurrent-http-fixture';
  assert.equal((await call(syncPath(concurrent))).status, 404);
  assert.equal((await call(syncPath(concurrent), 'PUT', input(concurrent), { 'If-None-Match': '*' })).status, 200);
  const before = await bytes();
  assert.equal((await call(normalPath(concurrent), 'DELETE', undefined, { 'If-None-Match': '*' })).status, 412);
  assert.equal(await bytes(), before);
  const existing = await (await call(syncPath(concurrent))).json() as Breeding;
  assert.equal(existing.note, 'Original');
});
