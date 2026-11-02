import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { feedingAlertActionsRouter } from '../../../server/src/routes/feedingAlertActions';
import { fatteningTransitionsRouter } from '../../../server/src/routes/fatteningTransitions';
import type { FeedingAlertActionInput } from './feedingAlertActionsApi';
import type { FatteningTransitionInput } from './fatteningTransitionsApi';
import type { StoredRecord, StoreName } from '../storage/types';

// Actual forms and APIs, authenticated HTTP, independent browser databases and
// temporary farm ledgers. Only the delivery of a committed response is altered.
const express = createRequire(path.resolve(process.cwd(), '../server/package.json'))('express');
const nativeFetch = globalThis.fetch;
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
const farmId = 'farm-management-real-http-fixture';
const otherFarmId = 'farm-other-management-real-http-fixture';
const firstTime = '2026-11-01T00:00:00.000Z';
const unknownBusinessField = { amount: '0007.50', nested: [null, '', { untouched: '001.20' }] };
const resources = [
  { store: 'feedingAlertActions', path: '/feeding-alert-actions', file: 'feeding-alert-actions-sync.json', prefix: 'feedingAlertActionSync',
    input: { actionDate: '2026-11-02', calfId: '700', calfName: '給与対応HTTP検証専用', ageDays: '100',
      alertType: '不足気味', actionType: '確認のみ', memo: '最初の対応内容', nextCheckDate: '', status: '未対応' } },
  { store: 'fatteningTransitions', path: '/fattening-transitions', file: 'fattening-transitions-sync.json', prefix: 'fatteningTransitionSync',
    input: { targetNumber: 'FATTENING-HTTP-FIXTURE', targetName: '肥育HTTP検証専用', startDate: '2026-11-02',
      transitionReason: '繁殖終了', startWeight: '00350.00', targetWeight: '', targetShippingDate: '',
      housingLocation: '', withdrawalEndDate: '', status: '肥育中', memo: '最初の移行内容' } },
] as const;
type Resource = typeof resources[number];
type LocalRecord = StoredRecord & { id: string };
type CloudRecord = LocalRecord & { cloudUpdatedAt: string; deletedAt?: string };
type RequestLog = { method: string; pathname: string; status?: number; ifMatch: string | null; ifNoneMatch: string | null };
type Client = {
  create(input: Record<string, unknown>): Promise<LocalRecord>;
  update(id: string, input: Record<string, unknown>): Promise<LocalRecord>;
  list(): Promise<LocalRecord[]>;
  remove(id: string): Promise<void>;
  retry(): Promise<number>;
  repository: typeof import('../storage/repository'); factory: IDBFactory;
};
let config: Resource;
let previousEnv: Record<string, string | undefined>;
let root = '';
let server: Server | undefined;
let database: IDBDatabase | undefined;
let users: FarmProUser[] = [];
let requests: RequestLog[] = [];
let protectedFiles: string[] = [];
let protectedBefore: string[] = [];
let protectedLocalStores: StoreName[] = [];
let localProtectedBefore: string[] = [];
let activeClient: Client | undefined;
let loseNextPut = false;
let loseNextDelete = false;
const farmFile = (name: string, farm = farmId) => `farms/${farm}/${name}`;
const raw = (name: string) => fs.readFile(path.join(root, name), 'utf8');
const cloudRecords = async () => JSON.parse(await raw(farmFile(config.file))) as CloudRecord[];
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
async function localProtectedBytes(client: Client) {
  return Promise.all(protectedLocalStores.map(async store => JSON.stringify(await client.repository.getAllRecords(store))));
}
async function assertLocalUnchanged() {
  if (activeClient) expect(await localProtectedBytes(activeClient)).toEqual(localProtectedBefore);
}
async function browser(device = 0, factory = new IDBFactory()): Promise<Client> {
  await assertLocalUnchanged();
  cleanup(); database?.close(); vi.resetModules();
  vi.stubGlobal('indexedDB', factory);
  window.localStorage.clear(); window.sessionStorage.clear();
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(authUser(users[device])));
  window.localStorage.setItem('farmpro.authToken', createToken(authUser(users[device])));
  const repository = await import('../storage/repository');
  database = await (await import('../storage/db')).openFarmProDatabase();
  for (const store of protectedLocalStores) {
    if (!await repository.getRecordById(store, 'protected-fixture')) await repository.saveRecordPreservingTimestamps(store, {
      id: 'protected-fixture', name: '変更しない検証用記録', amount: '00700', marker: `protected-${store}`,
      createdAt: firstTime, updatedAt: firstTime,
    });
  }
  const feeding = await import('./feedingAlertActionsApi');
  const fattening = await import('./fatteningTransitionsApi');
  const client: Client = config.store === 'feedingAlertActions' ? {
    create: input => feeding.createFeedingAlertAction(input as FeedingAlertActionInput) as Promise<LocalRecord>,
    update: (id, input) => feeding.updateFeedingAlertAction(id, input as FeedingAlertActionInput) as Promise<LocalRecord>,
    list: () => feeding.fetchFeedingAlertActions() as Promise<LocalRecord[]>,
    remove: feeding.deleteFeedingAlertAction, retry: feeding.retryPendingFeedingAlertActionSync, repository, factory,
  } : {
    create: input => fattening.createFatteningTransition(input as FatteningTransitionInput) as Promise<LocalRecord>,
    update: (id, input) => fattening.updateFatteningTransition(id, input as FatteningTransitionInput) as Promise<LocalRecord>,
    list: () => fattening.getFatteningTransitions() as Promise<LocalRecord[]>,
    remove: fattening.deleteFatteningTransition, retry: fattening.retryPendingFatteningTransitionSync, repository, factory,
  };
  activeClient = client; localProtectedBefore = await localProtectedBytes(client);
  return client;
}
async function showCreateForm() {
  const route = `${config.path}/new`;
  const query = config.store === 'feedingAlertActions'
    ? new URLSearchParams({ calfId: config.input.calfId, calfName: config.input.calfName, ageDays: config.input.ageDays, alertType: config.input.alertType })
    : new URLSearchParams({ targetNumber: config.input.targetNumber, targetName: config.input.targetName });
  window.history.replaceState(null, '', `${route}?${query}`);
  const Form = config.store === 'feedingAlertActions'
    ? (await import('../pages/FeedingAlertActionForm')).FeedingAlertActionForm
    : (await import('../pages/FatteningTransitionForm')).FatteningTransitionForm;
  render(<MemoryRouter initialEntries={[`${route}?${query}`]}><Routes>
    <Route path={route} element={<Form />} />
    <Route path={config.path} element={<div>記録の一覧へ戻った</div>} />
  </Routes></MemoryRouter>);
  if (config.store === 'feedingAlertActions') {
    fireEvent.change(screen.getByLabelText(/^対応日/), { target: { value: config.input.actionDate } });
  } else {
    fireEvent.change(screen.getByLabelText(/^肥育開始日/), { target: { value: config.input.startDate } });
    fireEvent.change(screen.getByLabelText('開始時体重 kg'), { target: { value: config.input.startWeight } });
  }
  fireEvent.change(screen.getByLabelText('メモ'), { target: { value: config.input.memo } });
}

describe.each(resources)('$store through actual forms and authenticated HTTP', resource => {
  beforeEach(async () => {
    config = resource;
    window.history.replaceState(null, '', config.path);
    previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-management-real-http-'));
    process.env.FARMPRO_DATA_DIR = root;
    process.env.FARMPRO_AUTH_SECRET = 'management-real-http-fixture-secret';
    process.env.NODE_ENV = 'test';
    const credentials = createPasswordHash('management-real-http-fixture-password');
    users = ['pc', 'phone', 'free'].map(device => ({
      id: `management-${device}-fixture`, farmId, farmName: 'Fixture farm', name: 'Fixture user',
      email: `${device}@example.invalid`, role: 'owner', plan: device === 'free' ? 'free' : 'standard', active: true, ...credentials,
    }));
    await put('users.json', users);
    await put('stripeSubscriptions.json', [{ id: 'protected-management-contract', marker: 'unchanged' }]);
    const ledgers = ['cattle.json', 'cattle-record-sync.json', 'calves.json', 'calves-sync.json', 'expenses.json',
      'expenses-sync.json', 'schedules.json', 'schedules-sync.json', 'settlement-sync.json', 'blv-tests-sync.json', 'feedingAlertActions.json'];
    for (const name of ledgers) await put(farmFile(name), [{ id: `protected-${name}`, marker: 'unchanged-fixture', amount: '00700' }]);
    for (const item of resources) {
      await put(farmFile(item.file), []);
      await put(farmFile(item.file, otherFarmId), [{ id: `other-farm-${item.store}`, marker: 'unchanged' }]);
    }
    const other = resources.find(item => item.store !== config.store)!;
    protectedFiles = ['users.json', 'stripeSubscriptions.json', ...ledgers.map(name => farmFile(name)),
      ...resources.map(item => farmFile(item.file, otherFarmId)), farmFile(other.file)];
    protectedBefore = await Promise.all(protectedFiles.map(raw));
    protectedLocalStores = ['cattle', 'calves', 'expenses', 'schedules', 'blvTests', other.store];
    requests = []; activeClient = undefined; localProtectedBefore = []; loseNextPut = false; loseNextDelete = false;
    const app = express(); app.use(express.json()); app.use('/api', requireAuth);
    app.use('/api/feeding-alert-actions', feedingAlertActionsRouter);
    app.use('/api/fattening-transitions', fatteningTransitionsRouter);
    server = app.listen(0, '127.0.0.1') as Server;
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture HTTP server failed to bind');
    const origin = `http://127.0.0.1:${address.port}`;
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.stubGlobal('fetch', async (requested: RequestInfo | URL, init?: RequestInit) => {
      const source = typeof requested === 'string' ? requested : requested instanceof URL ? requested.href : requested.url;
      const url = new URL(source, origin);
      expect(url.origin).toBe(origin);
      expect(url.pathname.startsWith(`/api${config.path}/record-sync`)).toBe(true);
      const headers = new Headers(init?.headers);
      const request: RequestLog = { method: init?.method || 'GET', pathname: url.pathname,
        ifMatch: headers.get('If-Match'), ifNoneMatch: headers.get('If-None-Match') };
      requests.push(request);
      const response = await nativeFetch(url.href, init); request.status = response.status;
      if ((loseNextPut && request.method === 'PUT') || (loseNextDelete && request.method === 'DELETE')) {
        if (request.method === 'PUT') loseNextPut = false; else loseNextDelete = false;
        expect(response.status).toBe(200); await response.text();
        throw new TypeError(`fixture: ${request.method} acknowledgement lost`);
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
      activeClient = undefined; database?.close(); database = undefined;
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
        server = undefined;
      }
      vi.restoreAllMocks(); vi.unstubAllGlobals();
      if (root) {
        expect(root.startsWith(path.join(os.tmpdir(), 'farmpro-management-real-http-'))).toBe(true);
        await fs.rm(root, { recursive: true, force: true }); root = '';
      }
      for (const key of envKeys) {
        if (previousEnv?.[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
      }
      window.localStorage.clear(); window.sessionStorage.clear();
    }
  });

  it('resaves the actual new form after a lost ACK with the same identity and the latest input', async () => {
    const client = await browser(); const user = userEvent.setup(); await showCreateForm();
    loseNextPut = true;
    await user.click(screen.getByRole('button', { name: '登録する' }));
    await waitFor(async () => {
      expect(await cloudRecords()).toHaveLength(1);
      expect(screen.getByRole('button', { name: '登録する' })).toBeEnabled();
    });
    expect(screen.queryByText('記録の一覧へ戻った')).toBeNull();
    const initial = await client.repository.getAllRecords<LocalRecord>(config.store);
    const originalCloud = await cloudRecords();
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ ...config.input, cloudSyncPending: true });
    expect(originalCloud[0].id).toBe(initial[0].syncRecordId || initial[0].id);
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '応答喪失後に確認した最新入力' } });
    await user.click(screen.getByRole('button', { name: '登録する' }));
    await screen.findByText('記録の一覧へ戻った');
    const local = await client.repository.getAllRecords<LocalRecord>(config.store);
    const cloud = await cloudRecords();
    expect(local).toHaveLength(1); expect(cloud).toHaveLength(1);
    expect(local[0]).toMatchObject({ id: initial[0].id, cloudSyncPending: false, memo: '応答喪失後に確認した最新入力' });
    expect(cloud[0]).toMatchObject({ id: originalCloud[0].id, memo: local[0].memo });
    expect(mutations()).toHaveLength(2);
    expect(new Set(mutations().map(request => request.pathname)).size).toBe(1);
    expect(mutations()[0].ifNoneMatch).toBe('*');
    expect(mutations()[1].ifMatch).toBe(JSON.stringify(originalCloud[0].cloudUpdatedAt));
  }, 20000);

  it('confirms a lost ACK by GET only and receives unknown content and dates on an independent device', async () => {
    const pc = await browser(); loseNextPut = true;
    await expect(pc.create({ ...config.input, unknownBusinessField })).rejects.toThrow('acknowledgement lost');
    const [pending] = await pc.repository.getAllRecords<LocalRecord>(config.store);
    const cloudBefore = await raw(farmFile(config.file)); const start = requests.length;
    expect(await pc.retry()).toBe(1);
    expect(requests.slice(start).map(request => request.method)).toEqual(['GET']);
    expect(await raw(farmFile(config.file))).toBe(cloudBefore);
    expect(await pc.repository.getRecordById(config.store, pending.id)).toMatchObject({
      id: pending.id, cloudSyncPending: false, unknownBusinessField, createdAt: pending.createdAt, updatedAt: pending.updatedAt,
    });
    expect(await pc.retry()).toBe(0);
    const peer = await browser(1);
    expect(await peer.list()).toMatchObject([{ ...config.input, unknownBusinessField,
      createdAt: pending.createdAt, updatedAt: pending.updatedAt, cloudSyncPending: false }]);
    expect(await peer.list()).toHaveLength(1);
    expect(await raw(farmFile(config.file))).toBe(cloudBefore);
  });

  it('preserves a stale device edit after another device saves a newer record', async () => {
    let pc = await browser(); const saved = await pc.create(config.input);
    const peer = await browser(1); const [received] = await peer.list();
    await peer.update(received.id, { ...config.input, memo: '別端末で確定した内容' });
    const cloudBefore = await raw(farmFile(config.file));
    pc = await browser(0, pc.factory); const start = requests.length;
    await expect(pc.update(saved.id, { ...config.input, memo: '古い端末で入力した内容' })).rejects.toThrow();
    expect(await pc.repository.getRecordById(config.store, saved.id)).toMatchObject({
      memo: '古い端末で入力した内容', cloudSyncPending: true, [`${config.prefix}Blocked`]: true,
    });
    expect(mutations(start)).toEqual([]);
    expect(await raw(farmFile(config.file))).toBe(cloudBefore);
    expect(await cloudRecords()).toMatchObject([{ memo: '別端末で確定した内容' }]);
  });

  it('does not revive a deleted record when an old device saves its local copy', async () => {
    let pc = await browser(); const saved = await pc.create(config.input);
    const peer = await browser(1); const [received] = await peer.list(); await peer.remove(received.id);
    const cloudBefore = await raw(farmFile(config.file));
    pc = await browser(0, pc.factory); const start = requests.length;
    await expect(pc.update(saved.id, { ...config.input, memo: '遠隔削除後の未確認入力' })).rejects.toThrow();
    expect(await pc.repository.getRecordById(config.store, saved.id)).toMatchObject({
      memo: '遠隔削除後の未確認入力', cloudSyncPending: true, [`${config.prefix}Blocked`]: true,
    });
    expect(mutations(start)).toEqual([]);
    expect(await raw(farmFile(config.file))).toBe(cloudBefore);
    expect((await cloudRecords()).filter(row => !row.deletedAt)).toEqual([]);
  });

  it('retains a lost DELETE acknowledgement for explicit retry and then propagates deletion to a peer', async () => {
    let pc = await browser(); const saved = await pc.create(config.input);
    let peer = await browser(1); const [received] = await peer.list(); const peerFactory = peer.factory;
    pc = await browser(0, pc.factory); loseNextDelete = true;
    await expect(pc.remove(saved.id)).rejects.toThrow('acknowledgement lost');
    expect(await pc.repository.getRecordById(config.store, saved.id)).toMatchObject({
      ...config.input, cloudSyncPending: true, [`${config.prefix}DeletePending`]: true,
    });
    const tombstoneBytes = await raw(farmFile(config.file)); const start = requests.length;
    await pc.remove(saved.id);
    expect(await pc.repository.getAllRecords(config.store)).toEqual([]);
    expect(requests.slice(start).map(request => request.method)).toEqual(['GET', 'DELETE']);
    expect(await raw(farmFile(config.file))).toBe(tombstoneBytes);
    peer = await browser(1, peerFactory);
    expect(await peer.repository.getRecordById(config.store, received.id)).toBeDefined();
    expect(await peer.list()).toEqual([]);
    expect(await peer.repository.getAllRecords(config.store)).toEqual([]);
    expect(await raw(farmFile(config.file))).toBe(tombstoneBytes);
  });

  it('keeps all Free operations within the device with no HTTP requests', async () => {
    const free = await browser(2); const saved = await free.create(config.input);
    expect(saved.cloudSyncPending).toBe(false);
    await free.update(saved.id, { ...config.input, memo: 'Free端末内だけの変更' });
    expect(await free.list()).toMatchObject([{ id: saved.id, memo: 'Free端末内だけの変更' }]);
    expect(await free.retry()).toBe(0);
    await free.remove(saved.id);
    expect(await free.repository.getAllRecords(config.store)).toEqual([]);
    expect(requests).toEqual([]); expect(await cloudRecords()).toEqual([]);
  });
});
