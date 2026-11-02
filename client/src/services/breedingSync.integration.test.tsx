import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
import expensesRouter from '../../../server/src/routes/expenses';
import { breedingsRouter } from '../../../server/src/routes/breedings';
import type { Breeding, BreedingInput } from '../types/breeding';

// Only the transport delays a response. The form, local storage, client services,
// authentication, farm isolation and breeding/expense HTTP handlers are real.
const express = createRequire(path.resolve(process.cwd(), '../server/package.json'))('express');
const nativeFetch = globalThis.fetch;
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
const farmId = 'farm-breeding-response-fixture';
const otherFarmId = 'farm-other-breeding-fixture';
const breedingInput: BreedingInput = {
  cowEarTag: 'FIXTURE-COW', cowName: '繁殖競合の試験牛', heatDate: '2026-11-01',
  breedingMethod: '種付', breedingStatus: '種付実施', inseminationDate: '2026-11-02', inseminationCost: '1200',
  bullName: '試験種雄牛', bullMasterId: 11, inseminatorName: '試験授精師', inseminatorMasterId: 12,
  transferPlannedDate: '', transferDate: '', transferCost: '', embryoCost: '', transferProcedureCost: '', transferOtherCost: '',
  transferCancelReason: '', embryoNumber: '', collectionDate: '', embryoType: '未選択', donorCowName: '', donorCowEarTag: '',
  embryoSireName: '', embryoGrade: '', strawNumber: '', supplierName: '', transferTechnician: '',
  nextHeatExpectedDate: '2026-11-23', pregnancyCheckExpectedDate: '2026-12-14', pregnancyCheckDate: '',
  pregnancyCheckCost: '', pregnancyResult: '未鑑定', recheckExpectedDate: '', expectedCalvingDate: '2027-08-14',
  note: '独立した画面・HTTP検証専用',
};
let previousEnv: Record<string, string | undefined>;
let root = '';
let server: Server | undefined;
let database: IDBDatabase | undefined;
let users: FarmProUser[] = [];
let requests: Array<{ method: string; pathname: string; status?: number; ifMatch: string | null; ifNoneMatch: string | null }>;
let protectedFiles: string[];
let protectedBefore: string[];
let holdPut = false;
let putArrived: () => void;
let putArrival: Promise<void>;
let releasePut: () => void;
let putRelease: Promise<void>;

const farmFile = (name: string) => `farms/${farmId}/${name}`;
const raw = (name: string) => fs.readFile(path.join(root, name), 'utf8');
const liveRecords = async (name: string) => (JSON.parse(await raw(farmFile(name))) as Array<Record<string, unknown>>)
  .filter(record => !record.deletedAt);
async function put(name: string, data: unknown) {
  const destination = path.join(root, name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(data), 'utf8');
}
function authUser(user: FarmProUser): AuthUser {
  const { passwordHash: _hash, passwordSalt: _salt, ...data } = user;
  return { ...data, plan: user.plan || 'free' };
}
async function browser(device = 0, factory = new IDBFactory()) {
  cleanup();
  database?.close();
  vi.resetModules();
  vi.stubGlobal('indexedDB', factory);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(authUser(users[device])));
  window.localStorage.setItem('farmpro.authToken', createToken(authUser(users[device])));
  const breedings = await import('./breedingApi');
  const expenses = await import('./expensesApi');
  const repository = await import('../storage/repository');
  database = await (await import('../storage/db')).openFarmProDatabase();
  return { breedings, expenses, repository, factory, databaseName: database.name };
}
async function showBreedingForm(id: string | number) {
  const { BreedingForm } = await import('../pages/BreedingForm');
  return render(<MemoryRouter initialEntries={[`/breedings/${id}/edit`]}>
    <Routes>
      <Route path="/breedings/:id/edit" element={<BreedingForm mode="edit" />} />
      <Route path="/breedings" element={<div>繁殖一覧へ戻った</div>} />
    </Routes>
  </MemoryRouter>);
}
async function independentWriter(factory: IDBFactory, databaseName: string, record: Breeding) {
  await new Promise<void>((resolve, reject) => {
    const request = factory.open(databaseName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const connection = request.result;
      const transaction = connection.transaction('breedings', 'readwrite');
      transaction.objectStore('breedings').put(record);
      transaction.oncomplete = () => { connection.close(); resolve(); };
      transaction.onerror = () => { connection.close(); reject(transaction.error); };
    };
  });
}

beforeEach(async () => {
  window.history.replaceState(null, '', '/breedings');
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-breeding-response-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'fixture-breeding-response-secret';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('fixture-breeding-response-password');
  users = ['pc', 'phone'].map(device => ({
    id: `breeding-${device}-fixture`, farmId, farmName: 'Fixture Farm', name: 'Fixture User',
    email: `${device}@example.invalid`, role: 'owner', plan: 'standard', active: true, ...credentials,
  }));
  await put('users.json', users);
  await put('stripeSubscriptions.json', [{ id: 'protected-contract-fixture' }]);
  await put('bank-transfer-applications.json', [{ id: 'protected-billing-fixture' }]);
  await put(farmFile('breedings.json'), []);
  await put(farmFile('expenses-sync.json'), []);
  await put(farmFile('settlement-sync.json'), []);
  await put(farmFile('cattle.json'), [{ id: 'protected-cow-fixture' }]);
  await put(`farms/${otherFarmId}/breedings.json`, [{ id: 'other-breeding', note: 'Other Farm' }]);
  await put(`farms/${otherFarmId}/expenses-sync.json`, [{ id: 'expense:other-farm', amount: '777' }]);
  protectedFiles = ['users.json', 'stripeSubscriptions.json', 'bank-transfer-applications.json',
    farmFile('cattle.json'), `farms/${otherFarmId}/breedings.json`, `farms/${otherFarmId}/expenses-sync.json`];
  protectedBefore = await Promise.all(protectedFiles.map(raw));
  requests = [];
  holdPut = false;
  putArrival = new Promise(resolve => { putArrived = resolve; });
  putRelease = new Promise(resolve => { releasePut = resolve; });
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/breedings', breedingsRouter);
  app.use('/api/expenses', expensesRouter);
  server = app.listen(0, '127.0.0.1') as Server;
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server failed to bind');
  const origin = `http://127.0.0.1:${address.port}`;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(requested, origin);
    expect(url.origin).toBe(origin);
    expect(url.pathname.startsWith('/api/')).toBe(true);
    const headers = new Headers(init?.headers);
    const request = { method: init?.method || 'GET', pathname: url.pathname, status: undefined as number | undefined,
      ifMatch: headers.get('If-Match'), ifNoneMatch: headers.get('If-None-Match') };
    requests.push(request);
    const response = await nativeFetch(url.href, init);
    request.status = response.status;
    if (holdPut && request.method === 'PUT' && url.pathname.startsWith('/api/breedings/record-sync/')) {
      putArrived();
      await putRelease;
    }
    return response;
  });
});

afterEach(async () => {
  releasePut?.();
  cleanup();
  database?.close();
  database = undefined;
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    server = undefined;
  }
  try {
    if (root) expect(await Promise.all(protectedFiles.map(raw))).toEqual(protectedBefore);
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (root) {
      expect(root.startsWith(path.join(os.tmpdir(), 'farmpro-breeding-response-'))).toBe(true);
      await fs.rm(root, { recursive: true, force: true });
      root = '';
    }
    for (const key of envKeys) {
      if (previousEnv?.[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    window.localStorage.clear();
    window.sessionStorage.clear();
  }
});

it('retains a newer independent-tab edit when the form receives a delayed PUT response, and stops expense updates and navigation', async () => {
  const client = await browser();
  const saved = await client.breedings.createBreeding(breedingInput);
  const expensesBefore = await raw(farmFile('expenses-sync.json'));
  const expense = (await client.expenses.getExpensesList())[0];
  const user = userEvent.setup();
  await showBreedingForm(saved.id);
  const cost = await screen.findByLabelText('人工授精・種付費（円）');
  await user.clear(cost);
  await user.type(cost, '2300');
  await user.clear(screen.getByLabelText('メモ'));
  await user.type(screen.getByLabelText('メモ'), 'この画面からの更新');
  const writesBefore = requests.filter(request => request.method !== 'GET' && request.pathname.startsWith('/api/expenses/')).length;
  holdPut = true;
  await user.click(screen.getByRole('button', { name: '保存' }));
  await putArrival;
  const before = await client.repository.getRecordById<Breeding>('breedings', saved.id);
  const changed = { ...before!, inseminationCost: '4500', note: '別タブでさらに追記した新しい内容',
    updatedAt: '2026-11-02T23:45:00.000Z', cloudSyncPending: true };
  await independentWriter(client.factory, client.databaseName, changed);
  await act(async () => { releasePut(); });
  await waitFor(() => expect(Boolean(screen.queryByText('繁殖一覧へ戻った') || screen.queryByText(/古い保存結果は反映していません/))).toBe(true));

  expect.soft(await client.repository.getRecordById('breedings', saved.id)).toEqual(changed);
  expect.soft(screen.queryByText(/古い保存結果は反映していません/)).not.toBeNull();
  expect.soft(screen.queryByText('繁殖一覧へ戻った')).toBeNull();
  expect.soft(await client.repository.getRecordById('expenses', expense.id)).toMatchObject({ amount: '1200' });
  expect.soft(await raw(farmFile('expenses-sync.json'))).toBe(expensesBefore);
  expect.soft(requests.filter(request => request.method !== 'GET' && request.pathname.startsWith('/api/expenses/'))).toHaveLength(writesBefore);
  expect(JSON.parse(await raw(farmFile('breedings.json')))[0]).toMatchObject({ inseminationCost: '2300', note: 'この画面からの更新' });
}, 20000);

it('completes an unchanged form save, updates its linked expense once, and exposes the result to an independent browser', async () => {
  const client = await browser();
  const saved = await client.breedings.createBreeding(breedingInput);
  const user = userEvent.setup();
  await showBreedingForm(saved.id);
  const cost = await screen.findByLabelText('人工授精・種付費（円）');
  await user.clear(cost);
  await user.type(cost, '2300');
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(await screen.findByText('繁殖一覧へ戻った')).toBeInTheDocument();
  expect(await client.repository.getRecordById('breedings', saved.id)).toMatchObject({ inseminationCost: '2300', cloudSyncPending: false });
  expect(await client.expenses.getExpensesList()).toMatchObject([{ amount: '2300', sourceType: 'breeding', sourceId: String(saved.id), sourceDetail: 'insemination' }]);
  expect(requests.filter(request => request.method === 'PUT' && request.pathname.startsWith('/api/expenses/'))).toHaveLength(2);
  const phone = await browser(1);
  expect(await phone.breedings.getBreedingList()).toMatchObject([{ id: saved.id, inseminationCost: '2300', cloudSyncPending: false }]);
  expect(await phone.expenses.getExpensesList()).toMatchObject([{ amount: '2300', sourceDetail: 'insemination' }]);
}, 20000);

it('rejects a stale browser edit after another browser accepted new breeding costs, preserving the accepted record and expenses', async () => {
  let pc = await browser(0);
  const saved = await pc.breedings.createBreeding(breedingInput);
  const phone = await browser(1);
  await phone.breedings.getBreedingList();
  await phone.expenses.getExpensesList({ requireCloudSync: true });
  await phone.breedings.updateBreeding(saved.id, {
    ...breedingInput, inseminationCost: '3400', note: 'スマートフォンで確定した新しい記録',
  });
  const cloudBefore = await Promise.all(['breedings.json', 'expenses-sync.json'].map(name => raw(farmFile(name))));
  expect(await liveRecords('breedings.json')).toMatchObject([{ inseminationCost: '3400', note: 'スマートフォンで確定した新しい記録' }]);
  expect(await liveRecords('expenses-sync.json')).toMatchObject([{ amount: '3400' }]);

  pc = await browser(0, pc.factory);
  const localExpenses = await pc.repository.getAllRecords('expenses');
  const start = requests.length;
  const result = await pc.breedings.updateBreeding(saved.id, {
    ...breedingInput, inseminationCost: '2200', note: '古いPC画面からの入力は未確認で保持',
  }).catch(error => error);

  expect.soft(result).toBeInstanceOf(Error);
  expect.soft(await pc.repository.getRecordById('breedings', saved.id)).toMatchObject({
    inseminationCost: '2200', note: '古いPC画面からの入力は未確認で保持', cloudSyncPending: true,
  });
  expect.soft(await pc.repository.getAllRecords('expenses')).toEqual(localExpenses);
  expect.soft(await Promise.all(['breedings.json', 'expenses-sync.json'].map(name => raw(farmFile(name))))).toEqual(cloudBefore);
  expect(requests.slice(start).filter(request => request.method !== 'GET' && request.pathname.startsWith('/api/expenses/'))).toEqual([]);
}, 20000);

it('does not recreate a deleted breeding or its fee when an independent stale browser saves the old record', async () => {
  let pc = await browser(0);
  const saved = await pc.breedings.createBreeding(breedingInput);
  const phone = await browser(1);
  await phone.breedings.getBreedingList();
  await phone.expenses.getExpensesList({ requireCloudSync: true });
  await phone.breedings.deleteBreeding(saved.id);
  expect(await liveRecords('breedings.json')).toEqual([]);
  expect(await liveRecords('expenses-sync.json')).toEqual([]);
  const cloudBefore = await Promise.all(['breedings.json', 'expenses-sync.json'].map(name => raw(farmFile(name))));

  pc = await browser(0, pc.factory);
  const localExpenses = await pc.repository.getAllRecords('expenses');
  const start = requests.length;
  const result = await pc.breedings.updateBreeding(saved.id, {
    ...breedingInput, inseminationCost: '5600', note: '別端末で削除された後の古い入力',
  }).catch(error => error);

  expect.soft(result).toBeInstanceOf(Error);
  expect.soft(await pc.repository.getRecordById('breedings', saved.id)).toMatchObject({
    inseminationCost: '5600', note: '別端末で削除された後の古い入力', cloudSyncPending: true,
  });
  expect.soft(await pc.repository.getAllRecords('expenses')).toEqual(localExpenses);
  expect.soft(await liveRecords('breedings.json')).toEqual([]);
  expect.soft(await liveRecords('expenses-sync.json')).toEqual([]);
  expect.soft(await Promise.all(['breedings.json', 'expenses-sync.json'].map(name => raw(farmFile(name))))).toEqual(cloudBefore);
  expect(requests.slice(start).filter(request => request.method !== 'GET' && request.pathname.startsWith('/api/expenses/'))).toEqual([]);
}, 20000);

it('does not delete newer breeding costs or their expense from an independent stale browser', async () => {
  let pc = await browser(0);
  const saved = await pc.breedings.createBreeding(breedingInput);
  const phone = await browser(1);
  await phone.breedings.getBreedingList();
  await phone.expenses.getExpensesList({ requireCloudSync: true });
  await phone.breedings.updateBreeding(saved.id, {
    ...breedingInput, inseminationCost: '7800', note: '削除前に別端末で確定した記録',
  });
  const cloudBefore = await Promise.all(['breedings.json', 'expenses-sync.json'].map(name => raw(farmFile(name))));

  pc = await browser(0, pc.factory);
  const localBefore = await pc.repository.getRecordById<Breeding>('breedings', saved.id);
  const localExpenses = await pc.repository.getAllRecords('expenses');
  const start = requests.length;
  const result = await pc.breedings.deleteBreeding(saved.id).then(() => undefined, error => error);

  expect.soft(result).toBeInstanceOf(Error);
  expect.soft(await pc.repository.getRecordById('breedings', saved.id)).toMatchObject({
    note: localBefore?.note, inseminationCost: localBefore?.inseminationCost,
  });
  expect.soft(await pc.repository.getAllRecords('expenses')).toEqual(localExpenses);
  expect.soft(await Promise.all(['breedings.json', 'expenses-sync.json'].map(name => raw(farmFile(name))))).toEqual(cloudBefore);
  expect(requests.slice(start).filter(request => request.method !== 'GET' && request.pathname.startsWith('/api/expenses/'))).toEqual([]);
}, 20000);
