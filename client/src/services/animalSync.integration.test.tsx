import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import { createPasswordHash, createToken, type AuthUser, type FarmProUser } from '../../../server/src/authStore';
import { requireAuth } from '../../../server/src/authMiddleware';
import { cattleRouter } from '../../../server/src/routes/cattle';
import { calvesRouter } from '../../../server/src/routes/calves';
import type { CattleInput } from '../types/cattle';
import type { CalfInput } from '../types/calf';
import type { StoredRecord } from '../storage/types';

// Real services, IndexedDB, app resume events, authentication and record-sync HTTP.
// Only the transport boundary simulates offline / response loss and resolves URLs.
const express = createRequire(path.resolve(process.cwd(), '../server/package.json'))('express');
const nativeFetch = globalThis.fetch;
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
const farmId = 'farm-animal-sync-fixture';
const otherFarmId = 'farm-animal-sync-other';
type Kind = 'cattle' | 'calves';
type Animal = StoredRecord & { name: string; cloudSyncPending?: boolean; cloudUpdatedAt?: string; syncId?: string; syncRecordId?: string };
type BrowserState = { factory: IDBFactory; storage: Array<[string, string]> };
let root = '';
let server: Server | undefined;
let origin = '';
let priorEnv: Record<string, string | undefined>;
let users: FarmProUser[];
let protectedFiles: string[];
let beforeProtected: string[];
let online = true;
let loseNextPutResponse = false;
const opened: IDBDatabase[] = [];
const requests: Array<{ method: string; pathname: string; ifMatch: string | null; ifNoneMatch: string | null; status?: number }> = [];

const cattleInput: CattleInput = {
  earTag: 'FIXTURE-COW', identificationNumber: '1234567890', name: '同期試験の牛',
  birthday: '2024-01-01', sex: '雌', sire: 'Fixture Sire', dam: 'Fixture Dam', parity: 1,
  blvStatus: '未検査', stage: '繁殖牛', note: 'one formal cattle save',
};
const calfInput: CalfInput = {
  calfNumber: 'FIXTURE-CALF', identificationNumber: '1234567891', name: '同期試験の子牛',
  birthday: '2026-08-01', sex: '雌', motherName: 'Fixture Dam', sireName: 'Fixture Sire',
  startWeight: 30, currentWeight: 80, elapsedDays: 90, milkAmount: 4, starterAmount: 1,
  feedingMethod: '人工哺育', weaningPlannedDate: '', weaningDate: '', weaningStatus: '離乳前',
  weaningWeight: 0, weaningStarterAmount: 0, milkEndDate: '', managementStatus: '育成中', note: 'one formal calf save',
};

function authUser(user: FarmProUser): AuthUser {
  const { passwordHash: _hash, passwordSalt: _salt, ...record } = user;
  return { ...record, plan: user.plan || 'free' };
}
function signIn(user: FarmProUser) {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(authUser(user)));
  window.localStorage.setItem('farmpro.authToken', createToken(authUser(user)));
}
function browserState(factory: IDBFactory): BrowserState {
  return { factory, storage: Object.keys(window.localStorage).map(key => [key, window.localStorage.getItem(key)!]) };
}
async function enterBrowser(state: BrowserState | undefined, user: FarmProUser) {
  cleanup();
  for (const database of opened) database.close();
  opened.length = 0;
  vi.resetModules();
  const factory = state?.factory ?? new IDBFactory();
  vi.stubGlobal('indexedDB', factory);
  signIn(user);
  if (state) {
    window.localStorage.clear();
    state.storage.forEach(([key, value]) => window.localStorage.setItem(key, value));
  }
  const repository = await import('../storage/repository');
  const cattle = await import('./api');
  const calves = await import('./calfApi');
  opened.push(await (await import('../storage/db')).openFarmProDatabase());
  return { factory, repository, cattle, calves };
}
type Device = Awaited<ReturnType<typeof enterBrowser>>;
const file = (kind: Kind) => `farms/${farmId}/${kind === 'cattle' ? 'cattle-record-sync.json' : 'calves-sync.json'}`;
const raw = (name: string) => fs.readFile(path.join(root, name), 'utf8');
const cloudRows = async (kind: Kind): Promise<Array<Record<string, any>>> => JSON.parse(await raw(file(kind)));
async function create(device: Device, kind: Kind): Promise<Animal> {
  return (kind === 'cattle' ? device.cattle.createCattle(cattleInput) : device.calves.createCalf(calfInput)) as Promise<Animal>;
}
async function edit(device: Device, kind: Kind, id: string | number, name: string): Promise<Animal> {
  return (kind === 'cattle'
    ? device.cattle.updateCattle(String(id), { ...cattleInput, name })
    : device.calves.updateCalf(String(id), { ...calfInput, name })) as Promise<Animal>;
}
async function pull(device: Device, kind: Kind): Promise<Animal[]> {
  if (kind === 'cattle') await device.cattle.pullNewerCattleRecordsFromCloud();
  else await device.calves.getCalfList();
  return device.repository.getAllRecords<Animal>(kind);
}
async function retry(device: Device, kind: Kind) {
  return kind === 'cattle' ? device.cattle.retryPendingCattleSync() : device.calves.retryPendingCalfSync();
}
async function mountList(kind: Kind) {
  const { AppLayout } = await import('../components/AppLayout');
  const Page = kind === 'cattle' ? (await import('../pages/CattleList')).CattleList : (await import('../pages/CalfList')).CalfList;
  window.history.replaceState(null, '', `/${kind}`);
  return render(<MemoryRouter initialEntries={[`/${kind}`]}><AppLayout><Page /></AppLayout></MemoryRouter>);
}

beforeEach(async () => {
  vi.resetModules();
  priorEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-animal-flow-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'fixture-animal-sync-secret';
  process.env.NODE_ENV = 'test';
  requests.length = 0;
  online = true;
  loseNextPutResponse = false;
  const credentials = createPasswordHash('fixture-animal-password');
  users = ['pc', 'phone', 'other', 'free'].map(device => ({
    id: `animal-${device}`, farmId: device === 'other' ? otherFarmId : farmId,
    farmName: 'Fixture Farm', name: 'Fixture User', email: `${device}@example.invalid`,
    role: 'owner', plan: device === 'free' ? 'free' : 'standard', active: true, ...credentials,
  }));
  const put = async (name: string, data: unknown) => {
    const destination = path.join(root, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, JSON.stringify(data), 'utf8');
  };
  await put('users.json', users);
  await put('stripeSubscriptions.json', [{ id: 'protected-contract' }]);
  await put('bank-transfer-applications.json', [{ id: 'protected-billing' }]);
  await put(file('cattle'), []);
  await put(file('calves'), []);
  await put(`farms/${farmId}/cattle.json`, [{ id: 91, name: '旧経路の保護記録' }]);
  await put(`farms/${farmId}/expenses-sync.json`, [{ id: 'protected-expense', amount: '12345' }]);
  await put(`farms/${farmId}/settlement-sync.json`, [{ id: 'protected-settlement' }]);
  await put(`farms/${otherFarmId}/cattle-record-sync.json`, [{ id: 'idn:9999999999', name: '別農場の牛' }]);
  await put(`farms/${otherFarmId}/calves-sync.json`, [{ id: 'manual-calf:other', name: '別農場の子牛' }]);
  protectedFiles = ['users.json', 'stripeSubscriptions.json', 'bank-transfer-applications.json',
    `farms/${farmId}/cattle.json`, `farms/${farmId}/expenses-sync.json`, `farms/${farmId}/settlement-sync.json`,
    `farms/${otherFarmId}/cattle-record-sync.json`, `farms/${otherFarmId}/calves-sync.json`];
  beforeProtected = await Promise.all(protectedFiles.map(raw));

  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/cattle', cattleRouter);
  app.use('/api/calves', calvesRouter);
  // Unchanged secondary readers used by the actual list UI get empty fixture histories.
  app.get('/api/operator/access', (_request: unknown, response: any) => response.json({ operator: false }));
  for (const resource of ['masters', 'breedings', 'calvings', 'sales', 'expenses']) {
    app.get(`/api/${resource}/record-sync`, (_request: unknown, response: any) => response.json([]));
  }
  server = app.listen(0, '127.0.0.1') as Server;
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server failed to bind');
  origin = `http://127.0.0.1:${address.port}`;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(requested, origin);
    expect(url.origin).toBe(origin);
    const headers = new Headers(init?.headers);
    const request = { method: init?.method || 'GET', pathname: url.pathname,
      ifMatch: headers.get('If-Match'), ifNoneMatch: headers.get('If-None-Match'), status: undefined as number | undefined };
    requests.push(request);
    if (!online && /^\/api\/(?:cattle|calves)\/record-sync/.test(url.pathname)) throw new TypeError('fixture: offline');
    const response = await nativeFetch(url.href, init);
    request.status = response.status;
    if (loseNextPutResponse && request.method === 'PUT' && response.ok) {
      loseNextPutResponse = false;
      await response.arrayBuffer();
      throw new TypeError('fixture: server committed, response lost');
    }
    return response;
  });
  window.history.replaceState(null, '', '/');
});

afterEach(async () => {
  cleanup();
  for (const database of opened) database.close();
  opened.length = 0;
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  if (root) {
    expect(await Promise.all(protectedFiles.map(raw))).toEqual(beforeProtected);
    expect(root.startsWith(path.join(os.tmpdir(), 'farmpro-animal-flow-'))).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  }
  root = '';
  for (const key of envKeys) {
    if (priorEnv?.[key] === undefined) delete process.env[key];
    else process.env[key] = priorEnv[key];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

it.each(['cattle', 'calves'] as const)('%s: retries a formal offline save through real online UI, survives reload, and receives an edit from an independent browser on focus', async kind => {
  const pc = await enterBrowser(undefined, users[0]);
  online = false;
  const saved = await create(pc, kind);
  const input = kind === 'cattle' ? cattleInput : calfInput;
  expect(await pc.repository.getRecordById(kind, saved.id)).toMatchObject({ ...input, cloudSyncPending: true });
  expect(await cloudRows(kind)).toEqual([]);
  const view = await mountList(kind);
  await waitFor(() => expect(screen.queryAllByText(input.name).length).toBeGreaterThan(0));
  const pendingWarning = kind === 'cattle'
    ? /クラウド同期が完了していない牛が1頭/
    : /クラウド同期を保留している子牛が1件/;
  await waitFor(() => expect(screen.getByText(pendingWarning)).toBeInTheDocument());
  online = true;
  fireEvent(window, new Event('online'));
  await waitFor(async () => expect(await pc.repository.getRecordById(kind, saved.id)).toMatchObject({ ...input, cloudSyncPending: false }));
  await waitFor(() => expect(screen.queryByText(pendingWarning)).not.toBeInTheDocument());
  const firstCloud = await cloudRows(kind);
  expect(firstCloud).toHaveLength(1);
  expect(firstCloud[0]).toMatchObject(input);
  expect(firstCloud[0]).not.toHaveProperty('animalSyncOrigin');
  expect(firstCloud[0]).not.toHaveProperty('animalSyncAttempt');
  expect(firstCloud[0]).not.toHaveProperty('cloudSyncPending');
  const successfulWrites = requests.filter(request => request.method === 'PUT' && request.status === 200);
  expect(successfulWrites).toHaveLength(1);
  expect(successfulWrites[0].ifNoneMatch).toBe('*');
  view.unmount();
  await retry(pc, kind);
  const pcState = browserState(pc.factory);

  const phone = await enterBrowser(undefined, users[1]);
  const unrelated = await phone.repository.saveRecord(kind, {
    ...input, id: 41, name: 'この端末だけの別個体', identificationNumber: '9999999998',
    ...(kind === 'cattle' ? { earTag: 'PHONE-OTHER' } : { calfNumber: 'PHONE-OTHER' }),
  });
  const rows = await pull(phone, kind);
  expect(rows).toHaveLength(2);
  const received = rows.find(row => row.identificationNumber === input.identificationNumber)!;
  expect(received).toMatchObject({ ...input, cloudSyncPending: false });
  expect(received.id).not.toBe(saved.id);
  const phoneName = `${input.name}・スマホで編集`;
  await edit(phone, kind, received.id, phoneName);
  expect(await phone.repository.getRecordById(kind, received.id)).toMatchObject({ name: phoneName, cloudSyncPending: false });
  expect(await phone.repository.getRecordById(kind, unrelated.id)).toEqual(unrelated);
  expect(await cloudRows(kind)).toHaveLength(1);
  expect((await cloudRows(kind))[0]).toMatchObject({ id: firstCloud[0].id, name: phoneName });

  const reloadedPc = await enterBrowser(pcState, users[0]);
  expect(await reloadedPc.repository.getRecordById(kind, saved.id)).toMatchObject({ name: input.name, cloudSyncPending: false });
  online = false;
  const pcView = await mountList(kind);
  await waitFor(() => expect(screen.queryAllByText(input.name).length).toBeGreaterThan(0));
  online = true;
  fireEvent(window, new Event('focus'));
  await waitFor(async () => expect(await reloadedPc.repository.getRecordById(kind, saved.id)).toMatchObject({ name: phoneName, cloudSyncPending: false }));
  await waitFor(() => expect(screen.queryAllByText(phoneName).length).toBeGreaterThan(0));
  pcView.unmount();
  await retry(reloadedPc, kind);
  expect((await reloadedPc.repository.getAllRecords(kind))).toHaveLength(1);
  expect(requests.filter(request => request.method === 'PUT' && request.status === 200)).toHaveLength(2);
  expect(requests.some(request => /\/api\/cattle\/\d+\/sync$/.test(request.pathname))).toBe(false);
}, 25000);

it.each(['cattle', 'calves'] as const)('%s: resolves a lost ACK by reading, keeps a competing edit pending, and never revives a cloud deletion', async kind => {
  const pc = await enterBrowser(undefined, users[0]);
  loseNextPutResponse = true;
  const saved = await create(pc, kind);
  expect(await pc.repository.getRecordById(kind, saved.id)).toMatchObject({ cloudSyncPending: true });
  const committed = await cloudRows(kind);
  expect(committed).toHaveLength(1);
  const afterCommit = await raw(file(kind));
  expect(await retry(pc, kind)).toBe(1);
  expect(await raw(file(kind))).toBe(afterCommit);
  expect(requests.filter(request => request.method === 'PUT')).toHaveLength(1);
  expect(await pc.repository.getRecordById(kind, saved.id)).toMatchObject({ cloudSyncPending: false });

  online = false;
  const pendingName = 'PCに保持する未送信の編集';
  await edit(pc, kind, saved.id, pendingName);
  const pending = await pc.repository.getRecordById(kind, saved.id);
  expect(pending).toMatchObject({ name: pendingName, cloudSyncPending: true });
  online = true;
  const url = `${origin}/api/${kind}/record-sync/${encodeURIComponent(committed[0].id)}`;
  const phoneHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${createToken(authUser(users[1]))}`,
    'If-Match': JSON.stringify(committed[0].cloudUpdatedAt) };
  const edited = await nativeFetch(url, { method: 'PUT', headers: phoneHeaders,
    body: JSON.stringify({ ...committed[0], name: '別端末の正式な編集', updatedAt: new Date().toISOString() }) });
  expect(edited.status).toBe(200);
  const remote = await edited.json() as Record<string, any>;
  const otherEditBytes = await raw(file(kind));
  expect(await retry(pc, kind)).toBe(0);
  await pull(pc, kind);
  expect({ ...await pc.repository.getRecordById(kind, saved.id), syncWarning: undefined }).toEqual({ ...pending, syncWarning: undefined });
  expect(await raw(file(kind))).toBe(otherEditBytes);

  const deleted = await nativeFetch(url, { method: 'DELETE', headers: {
    Authorization: phoneHeaders.Authorization, 'If-Match': JSON.stringify(remote.cloudUpdatedAt),
  } });
  expect(deleted.status).toBe(200);
  const deletionBytes = await raw(file(kind));
  expect(await retry(pc, kind)).toBe(0);
  await pull(pc, kind);
  expect({ ...await pc.repository.getRecordById(kind, saved.id), syncWarning: undefined }).toEqual({ ...pending, syncWarning: undefined });
  expect(await raw(file(kind))).toBe(deletionBytes);
  expect((await cloudRows(kind))[0].deletedAt).toBeTruthy();
}, 20000);

it('calving registration keeps its offline calf queued and sends that same linked calf on resume', async () => {
  const pc = await enterBrowser(undefined, users[0]);
  const calving = {
    id: 'fixture-calving-link', cowId: 'FIXTURE-MOTHER', cowName: 'Fixture mother',
    actualCalvingDate: '2026-10-30', calfName: 'FIXTURE-BORN', calfSex: 'メス',
    birthWeightKg: 30, calvingResult: '自然分娩', memo: 'keep the original birth note',
    createdAt: '2026-10-30T00:00:00.000Z', updatedAt: '2026-10-30T00:00:00.000Z',
  };
  await pc.repository.saveRecord('calvings', calving);
  online = false;
  const { registerCalvingToCalfLedger } = await import('./calvingsApi');
  const result = await registerCalvingToCalfLedger(calving.id);
  const pending = await pc.repository.getRecordById('calves', result.calf.id);
  expect(pending).toMatchObject({ calvingId: calving.id, cloudSyncPending: true });
  expect(pending?.animalSyncOrigin).toBeTruthy();
  expect(await pc.repository.getRecordById('calvings', calving.id)).toMatchObject({
    registeredToCalfLedger: true, calfId: String(result.calf.id),
  });
  expect(await cloudRows('calves')).toEqual([]);
  const view = await mountList('calves');
  await waitFor(() => expect(screen.getByText(/クラウド同期を保留している子牛が1件/)).toBeInTheDocument());
  online = true;
  fireEvent(window, new Event('online'));
  await waitFor(async () => expect(await pc.repository.getRecordById('calves', result.calf.id)).toMatchObject({
    cloudSyncPending: false, createdAt: pending?.createdAt, updatedAt: pending?.updatedAt,
  }));
  await waitFor(() => expect(screen.queryByText(/クラウド同期を保留している子牛が1件/)).not.toBeInTheDocument());
  view.unmount();
  await retry(pc, 'calves');
  const cloud = await cloudRows('calves');
  expect(cloud).toHaveLength(1);
  expect(cloud[0]).toMatchObject({ id: `calving:${calving.id}`, calvingId: calving.id });
  expect(cloud[0].memo).toContain(calving.memo);
  const phone = await enterBrowser(undefined, users[1]);
  const received = await pull(phone, 'calves');
  expect(received).toHaveLength(1);
  expect(received[0]).toMatchObject({ calvingId: calving.id, calfNumber: calving.calfName });
  expect(received[0].note).toContain(calving.memo);
}, 25000);

it('Free keeps new cattle and calf records local through resume events without creating upload ownership', async () => {
  const device = await enterBrowser(undefined, users[3]);
  const cow = await create(device, 'cattle');
  const calf = await create(device, 'calves');
  const view = await mountList('cattle');
  fireEvent(window, new Event('online'));
  fireEvent(window, new Event('focus'));
  await retry(device, 'cattle');
  await retry(device, 'calves');
  expect(await cloudRows('cattle')).toEqual([]);
  expect(await cloudRows('calves')).toEqual([]);
  for (const [kind, record] of [['cattle', cow], ['calves', calf]] as const) {
    const stored = await device.repository.getRecordById(kind, record.id);
    expect(stored).not.toHaveProperty('animalSyncOrigin');
    expect(stored?.cloudSyncPending).not.toBe(true);
  }
  expect(requests.filter(request => /^\/api\/(?:cattle|calves)\/record-sync/.test(request.pathname))).toEqual([]);
  view.unmount();
}, 20000);
