import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import { createPasswordHash, createToken, type AuthUser, type FarmProUser } from '../../../server/src/authStore';
import { requireAuth } from '../../../server/src/authMiddleware';
import { blvTestsRouter } from '../../../server/src/routes/blvTests';
import type { BlvTest, BlvTestInput } from '../types/blv';
import type { StoredRecord, StoreName } from '../storage/types';

// Real form, client services, independent IndexedDB devices, authentication and
// farm-scoped HTTP handlers. Only a committed response may be lost in transport.
const express = createRequire(path.resolve(process.cwd(), '../server/package.json'))('express');
const nativeFetch = globalThis.fetch;
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
const farmId = 'farm-blv-http-integration-fixture';
const otherFarmId = 'farm-other-blv-integration-fixture';
const firstTime = '2026-11-01T00:00:00.000Z';
const input: BlvTestInput = {
  cowEarTag: 'BLV-HTTP-FIXTURE-COW', cowName: 'BLV通信検証専用の試験牛', testDate: '2026-11-02',
  result: '未検査', nextTestDate: '2027-05-02', isolationMemo: '検証用の隔離メモ', note: '実HTTP検証だけの記録',
};
const laboratory = { value: '001.20', customCost: '0007.50', nested: ['fixture', null, { exact: '01' }] };
type LocalBlv = BlvTest & StoredRecord;
type CloudBlv = StoredRecord & { id: string; cloudUpdatedAt: string; deletedAt?: string };
type RequestLog = { method: string; pathname: string; status?: number; ifMatch: string | null; ifNoneMatch: string | null; body?: Record<string, unknown> };
type Client = {
  blv: typeof import('./blvApi'); repository: typeof import('../storage/repository'); factory: IDBFactory;
};
let previousEnv: Record<string, string | undefined>;
let root = '';
let server: Server | undefined;
let database: IDBDatabase | undefined;
let users: FarmProUser[] = [];
let requests: RequestLog[] = [];
let protectedFiles: string[] = [];
let protectedBefore: string[] = [];
let activeClient: Client | undefined;
let localProtectedBefore: string[] = [];
let loseNextPut = false;
let loseNextDelete = false;
const protectedLocalStores: StoreName[] = ['cattle', 'calves', 'expenses', 'schedules'];
const farmFile = (name: string, farm = farmId) => `farms/${farm}/${name}`;
const raw = (name: string) => fs.readFile(path.join(root, name), 'utf8');
const cloudRecords = async () => JSON.parse(await raw(farmFile('blv-tests-sync.json'))) as CloudBlv[];
const mutations = (from = 0) => requests.slice(from).filter(request => request.method !== 'GET');

async function put(name: string, data: unknown) {
  const destination = path.join(root, name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(data), 'utf8');
}
function authUser(user: FarmProUser): AuthUser {
  const { passwordHash: _hash, passwordSalt: _salt, ...data } = user;
  return { ...data, plan: user.plan || 'free' };
}
async function localProtectedBytes(client: Client): Promise<string[]> {
  return Promise.all(protectedLocalStores.map(async store => JSON.stringify(await client.repository.getAllRecords(store))));
}
async function assertLocalUnchanged() {
  if (activeClient) expect(await localProtectedBytes(activeClient)).toEqual(localProtectedBefore);
}
async function browser(device = 0, factory = new IDBFactory()): Promise<Client> {
  await assertLocalUnchanged();
  cleanup();
  database?.close();
  vi.resetModules();
  vi.stubGlobal('indexedDB', factory);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(authUser(users[device])));
  window.localStorage.setItem('farmpro.authToken', createToken(authUser(users[device])));
  const blv = await import('./blvApi');
  const repository = await import('../storage/repository');
  database = await (await import('../storage/db')).openFarmProDatabase();
  for (const store of protectedLocalStores) {
    if (!await repository.getRecordById(store, 700)) await repository.saveRecordPreservingTimestamps(store, {
      id: 700, earTag: 'PROTECTED-FIXTURE-COW', name: '変更しない検証用記録', amount: '00700',
      marker: `protected-${store}`, createdAt: firstTime, updatedAt: firstTime,
    });
  }
  const client = { blv, repository, factory };
  activeClient = client;
  localProtectedBefore = await localProtectedBytes(client);
  return client;
}
async function showCreateForm() {
  window.history.replaceState(null, '', '/blv/new');
  const { BlvForm } = await import('../pages/BlvForm');
  render(<MemoryRouter initialEntries={['/blv/new']}><Routes>
    <Route path="/blv/new" element={<BlvForm mode="create" />} />
    <Route path="/blv" element={<div>BLV一覧に戻った</div>} />
  </Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText(/^耳標番号/), { target: { value: input.cowEarTag } });
  fireEvent.change(screen.getByLabelText(/^牛名/), { target: { value: input.cowName } });
  fireEvent.change(screen.getByLabelText('検査日'), { target: { value: input.testDate } });
  fireEvent.change(screen.getByLabelText('次回検査予定日'), { target: { value: input.nextTestDate } });
  fireEvent.change(screen.getByLabelText('陽性牛の隔離メモ'), { target: { value: input.isolationMemo } });
  fireEvent.change(screen.getByLabelText('備考'), { target: { value: input.note } });
}

beforeEach(async () => {
  window.history.replaceState(null, '', '/blv');
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-blv-real-http-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'blv-real-http-fixture-secret';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('blv-real-http-fixture-password');
  users = ['pc', 'phone', 'free'].map(device => ({
    id: `blv-${device}-fixture`, farmId, farmName: 'Fixture farm', name: 'Fixture user',
    email: `${device}@example.invalid`, role: 'owner', plan: device === 'free' ? 'free' : 'standard',
    active: true, ...credentials,
  }));
  await put('users.json', users);
  await put('stripeSubscriptions.json', [{ id: 'protected-blv-contract-fixture', marker: 'unchanged' }]);
  await put('bank-transfer-applications.json', [{ id: 'protected-blv-billing-fixture', marker: 'unchanged' }]);
  const ledgers = ['cattle.json', 'cattle-record-sync.json', 'calves.json', 'calves-sync.json',
    'expenses.json', 'expenses-sync.json', 'schedules.json', 'schedules-sync.json', 'settlement-sync.json'];
  for (const name of ledgers) await put(farmFile(name), [{ id: `protected-${name}`, marker: 'unchanged-fixture', amount: '00700' }]);
  await put(farmFile('blvTests.json'), [{ ...input, id: 42, note: 'legacy fixture must stay unchanged' }]);
  await put(farmFile('blv-tests-sync.json'), []);
  await put(farmFile('blv-tests-sync.json', otherFarmId), [{ id: 'blv:other-farm-fixture', note: 'Unchanged other farm' }]);
  await put(farmFile('cattle.json', otherFarmId), [{ id: 42, note: 'Unchanged other farm cow' }]);
  protectedFiles = ['users.json', 'stripeSubscriptions.json', 'bank-transfer-applications.json',
    ...ledgers.map(name => farmFile(name)), farmFile('blvTests.json'),
    farmFile('blv-tests-sync.json', otherFarmId), farmFile('cattle.json', otherFarmId)];
  protectedBefore = await Promise.all(protectedFiles.map(raw));
  requests = [];
  activeClient = undefined;
  localProtectedBefore = [];
  loseNextPut = false;
  loseNextDelete = false;
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/blv-tests', blvTestsRouter);
  server = app.listen(0, '127.0.0.1') as Server;
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server failed to bind');
  const origin = `http://127.0.0.1:${address.port}`;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.stubGlobal('fetch', async (requested: RequestInfo | URL, init?: RequestInit) => {
    const source = typeof requested === 'string' ? requested : requested instanceof URL ? requested.href : requested.url;
    const url = new URL(source, origin);
    expect(url.origin).toBe(origin);
    expect(url.pathname.startsWith('/api/blv-tests/record-sync')).toBe(true);
    const headers = new Headers(init?.headers);
    const request: RequestLog = { method: init?.method || 'GET', pathname: url.pathname,
      ifMatch: headers.get('If-Match'), ifNoneMatch: headers.get('If-None-Match'),
      ...(init?.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : {}) };
    requests.push(request);
    const response = await nativeFetch(url.href, init);
    request.status = response.status;
    if ((loseNextPut && request.method === 'PUT') || (loseNextDelete && request.method === 'DELETE')) {
      if (request.method === 'PUT') loseNextPut = false; else loseNextDelete = false;
      expect(response.status).toBe(200);
      await response.text();
      throw new TypeError(`fixture: BLV ${request.method} acknowledgement lost`);
    }
    return response;
  });
});

afterEach(async () => {
  cleanup();
  try {
    await assertLocalUnchanged();
    expect(await Promise.all(protectedFiles.map(raw))).toEqual(protectedBefore);
    expect(requests.filter(request => request.status === undefined)).toEqual([]);
  } finally {
    activeClient = undefined;
    database?.close(); database = undefined;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      server = undefined;
    }
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    if (root) {
      expect(root.startsWith(path.join(os.tmpdir(), 'farmpro-blv-real-http-'))).toBe(true);
      await fs.rm(root, { recursive: true, force: true }); root = '';
    }
    for (const key of envKeys) {
      if (previousEnv?.[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
    }
    window.localStorage.clear(); window.sessionStorage.clear();
  }
});

it('retries an actual new BLV form after a lost PUT response using one local/cloud identity and its latest input', async () => {
  const client = await browser();
  const user = userEvent.setup();
  await showCreateForm();
  loseNextPut = true;
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('この端末に保存されています');
  expect(screen.queryByText('BLV一覧に戻った')).toBeNull();
  const initial = await client.repository.getAllRecords<LocalBlv>('blvTests');
  expect(initial).toHaveLength(1);
  expect(initial[0]).toMatchObject({ ...input, cloudSyncPending: true });
  const originalCloud = await cloudRecords();
  expect(originalCloud).toHaveLength(1);
  expect(originalCloud[0].id).toBe(initial[0].syncRecordId);
  expect(initial[0].syncRecordId).toMatch(/^blv:[0-9a-f-]{36}$/);

  fireEvent.change(screen.getByLabelText(/^牛名/), { target: { value: '確認して修正した試験牛' } });
  fireEvent.change(screen.getByLabelText('備考'), { target: { value: '応答喪失後の最新入力を保存' } });
  await user.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('BLV一覧に戻った');
  const local = await client.repository.getAllRecords<LocalBlv>('blvTests');
  const cloud = await cloudRecords();
  expect(local).toHaveLength(1);
  expect(cloud).toHaveLength(1);
  expect(local[0]).toMatchObject({ id: initial[0].id, syncRecordId: initial[0].syncRecordId, cloudSyncPending: false,
    cowName: '確認して修正した試験牛', note: '応答喪失後の最新入力を保存' });
  expect(cloud[0]).toMatchObject({ id: initial[0].syncRecordId, cowName: local[0].cowName, note: local[0].note });
  expect(mutations()).toHaveLength(2);
  expect(new Set(mutations().map(request => request.pathname)).size).toBe(1);
  expect(mutations()[0].ifNoneMatch).toBe('*');
  expect(mutations()[1].ifMatch).toBe(JSON.stringify(originalCloud[0].cloudUpdatedAt));
}, 20000);

it('confirms a lost BLV ACK by GET only and delivers the same unknown business content to an independent device', async () => {
  const pc = await browser();
  loseNextPut = true;
  await expect(pc.blv.createBlvTest({ ...input, laboratory } as BlvTestInput)).rejects.toThrow('acknowledgement lost');
  const pending = await pc.repository.getAllRecords<LocalBlv>('blvTests');
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ laboratory, cloudSyncPending: true });
  const cloudBefore = await raw(farmFile('blv-tests-sync.json'));
  const start = requests.length;
  expect(await pc.blv.retryPendingBlvSync()).toBe(1);
  expect(requests.slice(start).map(request => request.method)).toEqual(['GET']);
  expect(mutations(start)).toEqual([]);
  expect(await raw(farmFile('blv-tests-sync.json'))).toBe(cloudBefore);
  const acknowledged = await pc.repository.getAllRecords<LocalBlv>('blvTests');
  expect(acknowledged).toHaveLength(1);
  expect(acknowledged[0]).toMatchObject({ id: pending[0].id, syncRecordId: pending[0].syncRecordId,
    cloudSyncPending: false, createdAt: pending[0].createdAt, updatedAt: pending[0].updatedAt, laboratory });
  expect(await pc.blv.retryPendingBlvSync()).toBe(0);

  const peer = await browser(1);
  expect(await peer.blv.getBlvTestList()).toMatchObject([{ ...input, syncRecordId: pending[0].syncRecordId, laboratory, cloudSyncPending: false }]);
  expect(await peer.blv.getBlvTestList()).toHaveLength(1);
  expect(await peer.repository.getAllRecords('blvTests')).toHaveLength(1);
  expect(await raw(farmFile('blv-tests-sync.json'))).toBe(cloudBefore);
});

it('keeps a stale device edit pending after a different device commits a newer BLV result', async () => {
  let pc = await browser();
  const saved = await pc.blv.createBlvTest(input);
  const peer = await browser(1);
  const [received] = await peer.blv.getBlvTestList();
  expect(received.syncRecordId).toBe(saved.syncRecordId);
  await peer.blv.updateBlvTest(received.id, { ...input, result: '陽性', note: '別端末で確定した検査結果' });
  const cloudBefore = await raw(farmFile('blv-tests-sync.json'));

  pc = await browser(0, pc.factory);
  const start = requests.length;
  await expect(pc.blv.updateBlvTest(saved.id, { ...input, result: '陰性', note: '古い端末の未確認編集' })).rejects.toBeInstanceOf(pc.blv.BlvSyncConflictError);
  expect(await pc.repository.getRecordById('blvTests', saved.id)).toMatchObject({
    syncRecordId: saved.syncRecordId, result: '陰性', note: '古い端末の未確認編集', cloudSyncPending: true, blvSyncBlocked: true,
  });
  expect(mutations(start)).toEqual([]);
  expect(await raw(farmFile('blv-tests-sync.json'))).toBe(cloudBefore);
  expect(await cloudRecords()).toMatchObject([{ result: '陽性', note: '別端末で確定した検査結果' }]);
});

it('does not revive a remotely deleted BLV when another device saves an old local record', async () => {
  let pc = await browser();
  const saved = await pc.blv.createBlvTest(input);
  const peer = await browser(1);
  const [received] = await peer.blv.getBlvTestList();
  await peer.blv.deleteBlvTest(received.id);
  expect(await peer.repository.getAllRecords('blvTests')).toEqual([]);
  const cloudBefore = await raw(farmFile('blv-tests-sync.json'));
  const tombstones = await cloudRecords();
  expect(tombstones).toHaveLength(1);
  expect(tombstones[0].deletedAt).toEqual(expect.any(String));

  pc = await browser(0, pc.factory);
  const start = requests.length;
  await expect(pc.blv.updateBlvTest(saved.id, { ...input, note: '遠隔削除後の古い入力' })).rejects.toBeInstanceOf(pc.blv.BlvSyncConflictError);
  expect(await pc.repository.getRecordById('blvTests', saved.id)).toMatchObject({
    syncRecordId: saved.syncRecordId, note: '遠隔削除後の古い入力', cloudSyncPending: true, blvSyncBlocked: true,
  });
  expect(mutations(start)).toEqual([]);
  expect(await raw(farmFile('blv-tests-sync.json'))).toBe(cloudBefore);
  expect((await cloudRecords()).filter(record => !record.deletedAt)).toEqual([]);
});

it('retains an unconfirmed BLV deletion locally, completes one explicit retry and propagates the tombstone to a peer', async () => {
  let pc = await browser();
  const saved = await pc.blv.createBlvTest(input);
  let peer = await browser(1);
  const [received] = await peer.blv.getBlvTestList();
  const peerFactory = peer.factory;
  pc = await browser(0, pc.factory);
  loseNextDelete = true;
  await expect(pc.blv.deleteBlvTest(saved.id)).rejects.toThrow('acknowledgement lost');
  expect(await pc.repository.getRecordById('blvTests', saved.id)).toMatchObject({
    ...input, id: saved.id, cloudSyncPending: true, blvSyncDeletePending: true,
  });
  const tombstoneBytes = await raw(farmFile('blv-tests-sync.json'));
  expect((await cloudRecords())[0].deletedAt).toEqual(expect.any(String));
  const start = requests.length;
  await pc.blv.deleteBlvTest(saved.id);
  expect(await pc.repository.getAllRecords('blvTests')).toEqual([]);
  expect(requests.slice(start).map(request => request.method)).toEqual(['GET', 'DELETE']);
  expect(requests.filter(request => request.method === 'DELETE')).toHaveLength(2);
  expect(await raw(farmFile('blv-tests-sync.json'))).toBe(tombstoneBytes);

  peer = await browser(1, peerFactory);
  expect(await peer.repository.getRecordById('blvTests', received.id)).toBeDefined();
  expect(await peer.blv.getBlvTestList()).toEqual([]);
  expect(await peer.repository.getAllRecords('blvTests')).toEqual([]);
  expect(await raw(farmFile('blv-tests-sync.json'))).toBe(tombstoneBytes);
});

it('keeps all Free BLV operations local without making an HTTP request', async () => {
  const free = await browser(2);
  const saved = await free.blv.createBlvTest(input);
  expect(saved.cloudSyncPending).toBe(false);
  await free.blv.updateBlvTest(saved.id, { ...input, note: 'Free端末内だけの変更' });
  expect(await free.blv.getBlvTestList()).toMatchObject([{ id: saved.id, note: 'Free端末内だけの変更' }]);
  expect(await free.blv.retryPendingBlvSync()).toBe(0);
  await free.blv.deleteBlvTest(saved.id);
  expect(await free.repository.getAllRecords('blvTests')).toEqual([]);
  expect(requests).toEqual([]);
  expect(await cloudRecords()).toEqual([]);
});
