import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
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
import expensesRouter from '../../../server/src/routes/expenses';
import { vaccinesRouter } from '../../../server/src/routes/vaccines';
import type { ExpenseInput } from './expensesApi';
import type { VaccineInput } from '../types/vaccine';

// Exercise the actual client services, authentication and farm-scoped HTTP
// handlers. Only the transport boundary injects failures and resolves API URLs.
const express = createRequire(path.resolve(process.cwd(), '../server/package.json'))('express');
const nativeFetch = globalThis.fetch;
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
const farmId = 'farm-vaccine-delete-fixture';
const otherFarmId = 'farm-other-vaccine-fixture';
const vaccineInput: VaccineInput = {
  targetType: '成牛', targetNumber: 'FIXTURE-COW', targetName: 'Fixture Cow',
  vaccineName: 'Fixture Vaccine', vaccineCost: '3200', vaccinationDate: '2026-11-01',
  nextDueDate: '', status: '接種済', note: 'Isolated deletion fixture',
};
let previousEnv: Record<string, string | undefined>;
let root = '';
let server: Server | undefined;
let database: IDBDatabase | undefined;
let users: FarmProUser[] = [];
let failDelete: 'vaccine' | 'expense' | undefined;
let loseExpenseSaveResponse = false;
let loseVaccineDeleteResponse = false;
let offline = false;
let loseVaccineSaveResponse = false;
let requests: Array<{ method: string; pathname: string; status?: number; ifMatch: string | null; ifNoneMatch: string | null }>;
let protectedFiles: string[];
let protectedBefore: string[];
let browserStorage = new WeakMap<IDBFactory, Array<[string, string]>>();
let activeFactory: IDBFactory | undefined;

const farmFile = (name: string) => `farms/${farmId}/${name}`;
const raw = (name: string) => fs.readFile(path.join(root, name), 'utf8');
async function put(name: string, data: unknown) {
  const destination = path.join(root, name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(data), 'utf8');
}
function authUser(user: FarmProUser): AuthUser {
  const { passwordHash: _hash, passwordSalt: _salt, ...data } = user;
  return { ...data, plan: user.plan || 'free' };
}
function expenseContent(records: unknown[]) {
  return records.map(value => {
    // A successful preflight refreshes the receipt clock, not business content.
    const { cloudUpdatedAt: _receiptClock, ...record } = value as Record<string, unknown>;
    return JSON.parse(JSON.stringify(record));
  });
}
async function browser(device: number, factory = new IDBFactory()) {
  cleanup();
  if (activeFactory) browserStorage.set(activeFactory, Object.keys(window.localStorage).map(key => [key, window.localStorage.getItem(key)!]));
  database?.close();
  vi.resetModules();
  vi.stubGlobal('indexedDB', factory);
  window.localStorage.clear();
  window.sessionStorage.clear();
  for (const [key, value] of browserStorage.get(factory) ?? []) window.localStorage.setItem(key, value);
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(authUser(users[device])));
  window.localStorage.setItem('farmpro.authToken', createToken(authUser(users[device])));
  const vaccines = await import('./vaccineApi');
  const expenses = await import('./expensesApi');
  const repository = await import('../storage/repository');
  database = await (await import('../storage/db')).openFarmProDatabase();
  activeFactory = factory;
  return { vaccines, expenses, repository, factory };
}
async function showVaccineList() {
  const { AppLayout } = await import('../components/AppLayout');
  const { VaccineList } = await import('../pages/VaccineList');
  return render(createElement(MemoryRouter, { initialEntries: ['/vaccines'] },
    createElement(AppLayout, { children: createElement(VaccineList) })));
}
async function saveVaccination(client: Awaited<ReturnType<typeof browser>>) {
  const vaccine = await client.vaccines.createVaccine(vaccineInput);
  const expenseInput: ExpenseInput = {
    paymentDate: vaccineInput.vaccinationDate, category: '医薬品費', description: vaccineInput.vaccineName,
    vendor: 'Fixture Vet', amount: vaccineInput.vaccineCost, paymentMethod: '', target: vaccineInput.targetName,
    sourceType: 'vaccine', sourceId: String(vaccine.id), memo: 'Exact linked vaccine expense',
  };
  const expense = await client.expenses.createExpense(expenseInput);
  return { vaccine, expense };
}

beforeEach(async () => {
  activeFactory = undefined;
  browserStorage = new WeakMap();
  window.history.replaceState(null, '', '/vaccines');
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-vaccine-flow-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'fixture-vaccine-flow-secret';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('fixture-vaccine-flow-password');
  users = ['pc', 'phone', 'other-farm'].map(device => ({
    id: `vaccine-${device}-fixture`, farmId: device === 'other-farm' ? otherFarmId : farmId,
    farmName: 'Fixture Farm', name: 'Fixture User', email: `${device}@example.invalid`,
    role: 'owner', plan: 'standard', active: true, ...credentials,
  }));
  await put('users.json', users);
  await put('stripeSubscriptions.json', [{ id: 'protected-contract-fixture' }]);
  await put('bank-transfer-applications.json', [{ id: 'protected-billing-fixture' }]);
  await put(farmFile('vaccines-sync.json'), []);
  await put(farmFile('expenses-sync.json'), []);
  await put(farmFile('settlement-sync.json'), []);
  await put(farmFile('cattle.json'), [{ id: 'protected-cow-fixture' }]);
  await put(`farms/${otherFarmId}/vaccines-sync.json`, [{ id: 'vaccine:777', vaccineName: 'Other Farm' }]);
  await put(`farms/${otherFarmId}/expenses-sync.json`, [{ id: 'expense:other-farm', amount: '777' }]);
  protectedFiles = ['users.json', 'stripeSubscriptions.json', 'bank-transfer-applications.json',
    farmFile('cattle.json'), `farms/${otherFarmId}/vaccines-sync.json`, `farms/${otherFarmId}/expenses-sync.json`];
  protectedBefore = await Promise.all(protectedFiles.map(raw));

  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/vaccines', vaccinesRouter);
  app.use('/api/expenses', expensesRouter);
  app.get('/api/operator/access', (_request: unknown, response: any) => response.json({ operator: false }));
  server = app.listen(0, '127.0.0.1') as Server;
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server failed to bind');
  const origin = `http://127.0.0.1:${address.port}`;
  requests = [];
  failDelete = undefined;
  loseExpenseSaveResponse = false;
  loseVaccineDeleteResponse = false;
  offline = false;
  loseVaccineSaveResponse = false;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => !offline);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
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
    if (offline) throw new TypeError('Fixture: browser is offline');
    if (request.method === 'DELETE' && failDelete && url.pathname.startsWith(`/api/${failDelete}s/record-sync/`)) {
      request.status = 503;
      return Response.json({ message: 'Fixture: deletion unavailable' }, { status: 503 });
    }
    const response = await nativeFetch(url.href, init);
    request.status = response.status;
    if (loseVaccineSaveResponse && request.method === 'PUT' && url.pathname.startsWith('/api/vaccines/record-sync/')) {
      loseVaccineSaveResponse = false;
      throw new TypeError('Fixture: vaccine saved, but its response was lost');
    }
    if (loseExpenseSaveResponse && request.method === 'PUT' && url.pathname.startsWith('/api/expenses/record-sync/')) {
      loseExpenseSaveResponse = false;
      throw new TypeError('Fixture: expense saved, but its response was lost');
    }
    if (loseVaccineDeleteResponse && request.method === 'DELETE' && url.pathname.startsWith('/api/vaccines/record-sync/')) {
      loseVaccineDeleteResponse = false;
      throw new TypeError('Fixture: vaccine deleted, but its response was lost');
    }
    return response;
  });
});

it('retries an offline formal vaccine save through the real online handler, clears the visible warning and delivers it to another browser', async () => {
  const pc = await browser(0);
  offline = true;
  const saved = await pc.vaccines.createVaccine({ ...vaccineInput, vaccineCost: '', note: 'Offline formal vaccine save' });
  expect(await pc.repository.getRecordById('vaccines', saved.id)).toMatchObject({ cloudSyncPending: true });
  expect(JSON.parse(await raw(farmFile('vaccines-sync.json')))).toEqual([]);
  const retained = await pc.repository.getRecordById('vaccines', saved.id);
  await showVaccineList();
  expect(await screen.findByText(/未送信のワクチン記録が1件あります/)).toBeInTheDocument();

  offline = false;
  fireEvent(window, new Event('online'));
  await waitFor(() => expect(screen.queryByText(/未送信のワクチン記録が1件あります/)).not.toBeInTheDocument());
  expect(await pc.repository.getRecordById('vaccines', saved.id)).toMatchObject({
    id: saved.id, note: 'Offline formal vaccine save', vaccineCost: '', cloudSyncPending: false,
    createdAt: retained?.createdAt, updatedAt: retained?.updatedAt,
  });
  const writes = requests.filter(request => request.method === 'PUT' && request.pathname.startsWith('/api/vaccines/record-sync/'));
  expect(writes.filter(request => request.status === 200)).toHaveLength(1);
  expect(writes.every(request => request.ifNoneMatch === '*')).toBe(true);
  const phone = await browser(1);
  expect(await phone.vaccines.getVaccineList()).toMatchObject([
    { id: saved.id, note: 'Offline formal vaccine save', vaccineCost: '', cloudSyncPending: false },
  ]);
  expect(JSON.parse(await raw(farmFile('expenses-sync.json')))).toEqual([]);
  expect(JSON.parse(await raw(farmFile('settlement-sync.json')))).toEqual([]);
}, 20000);

afterEach(async () => {
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
      expect(root.startsWith(path.join(os.tmpdir(), 'farmpro-vaccine-flow-'))).toBe(true);
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

it('keeps a vaccine and its expense on failed DELETE, then removes both after confirmed deletion in each browser', async () => {
  let pc = await browser(0);
  const { vaccine, expense } = await saveVaccination(pc);
  const unrelated = await pc.expenses.createExpense({
    paymentDate: '2026-11-01', category: '医薬品費', description: 'Unrelated medicine fee', vendor: '',
    amount: '500', paymentMethod: '現金', target: '', sourceType: 'manual', memo: '',
  });
  const phone = await browser(1);
  expect(await phone.vaccines.getVaccineList()).toHaveLength(1);
  expect(await phone.expenses.getExpensesList({ requireCloudSync: true })).toHaveLength(2);
  pc = await browser(0, pc.factory);
  const beforeVaccines = await pc.repository.getAllRecords('vaccines');
  const beforeExpenses = await pc.repository.getAllRecords('expenses');
  const cloudBefore = await Promise.all(['vaccines-sync.json', 'expenses-sync.json', 'settlement-sync.json'].map(name => raw(farmFile(name))));
  const requestStart = requests.length;
  failDelete = 'vaccine';
  await expect(pc.vaccines.deleteVaccine(vaccine.id)).rejects.toThrow();
  expect(await pc.repository.getAllRecords('vaccines')).toEqual(beforeVaccines.map(record => ({ ...record, vaccineSyncDeletePending: true })));
  expect(expenseContent(await pc.repository.getAllRecords('expenses'))).toEqual(expenseContent(beforeExpenses));
  expect(await Promise.all(['vaccines-sync.json', 'expenses-sync.json', 'settlement-sync.json'].map(name => raw(farmFile(name))))).toEqual(cloudBefore);
  expect(requests.slice(requestStart).filter(row => row.method === 'DELETE')).toMatchObject([
    { method: 'DELETE', pathname: `/api/vaccines/record-sync/${encodeURIComponent(`vaccine:${vaccine.id}`)}`, status: 503 },
  ]);

  failDelete = undefined;
  await pc.vaccines.deleteVaccine(vaccine.id);
  expect(await pc.vaccines.getVaccineList()).toEqual([]);
  expect(await pc.expenses.getExpensesList({ requireCloudSync: true })).toEqual([
    expect.objectContaining({ id: unrelated.id, description: 'Unrelated medicine fee', amount: '500', paymentMethod: '現金' }),
  ]);
  const cloudVaccines = JSON.parse(await raw(farmFile('vaccines-sync.json')));
  expect(cloudVaccines).toEqual([expect.objectContaining({ id: `vaccine:${vaccine.id}`, deletedAt: expect.any(String), vaccineCost: '3200' })]);
  const cloudExpenses = JSON.parse(await raw(farmFile('expenses-sync.json')));
  expect(cloudExpenses).toHaveLength(2);
  expect(cloudExpenses.find((row: { id: string }) => row.id === `expense:${expense.id}`)).toMatchObject({
    deletedAt: expect.any(String), sourceType: 'vaccine', sourceId: String(vaccine.id), amount: '3200', paymentMethod: '',
  });
  expect(cloudExpenses.find((row: { id: string }) => row.id === `expense:${unrelated.id}`)?.deletedAt).toBeUndefined();
  expect(await raw(farmFile('settlement-sync.json'))).toBe(cloudBefore[2]);

  const reopenedPhone = await browser(1, phone.factory);
  expect(await reopenedPhone.vaccines.getVaccineList()).toEqual([]);
  expect(await reopenedPhone.vaccines.getVaccineList()).toEqual([]);
  expect(await reopenedPhone.expenses.getExpensesList({ requireCloudSync: true })).toEqual([
    expect.objectContaining({ id: unrelated.id, amount: '500', paymentMethod: '現金' }),
  ]);
  expect(requests.slice(requestStart).some(row => row.method === 'PUT')).toBe(false);
}, 20000);

it.each([
  { device: 'a browser without the expense', lostResponse: false },
  { device: 'a browser with an unacknowledged expense', lostResponse: true },
])('blocks deletion from $device when another device settled the linked expense', async ({ lostResponse }) => {
  const pc = await browser(0);
  loseExpenseSaveResponse = lostResponse;
  const { vaccine, expense } = await saveVaccination(pc);
  await put(farmFile('settlement-sync.json'), [{
    settlement: {
      schemaVersion: 1, saleId: 'fixture-finalized-sale', settlementNumber: 'FIXTURE-SETTLED',
      expectedNetYen: 0, expenseIds: [], linkedExpenseIds: [`expense:${expense.id}`],
      createdAt: new Date().toISOString(),
    }, expenses: [],
  }]);
  const phone = lostResponse ? pc : await browser(1);
  expect(await phone.vaccines.getVaccineList()).toHaveLength(1);
  expect(await phone.repository.getAllRecords('expenses')).toEqual(lostResponse ? [
    expect.objectContaining({ id: expense.id, cloudSyncPending: true }),
  ] : []);
  const before = await Promise.all(['vaccines-sync.json', 'expenses-sync.json', 'settlement-sync.json'].map(name => raw(farmFile(name))));
  const requestStart = requests.length;
  await expect(phone.vaccines.deleteVaccine(vaccine.id)).rejects.toThrow(/精算/);
  expect(await phone.repository.getAllRecords('vaccines')).toHaveLength(1);
  expect(requests.slice(requestStart).every(row => row.method === 'GET')).toBe(true);
  expect(await Promise.all(['vaccines-sync.json', 'expenses-sync.json', 'settlement-sync.json'].map(name => raw(farmFile(name))))).toEqual(before);
}, 20000);

it('reports an expense cleanup failure after confirmed vaccine deletion and preserves the fee for explicit correction', async () => {
  const pc = await browser(0);
  const { vaccine, expense } = await saveVaccination(pc);
  failDelete = 'expense';
  await expect(pc.vaccines.deleteVaccine(vaccine.id)).rejects.toBeInstanceOf(pc.vaccines.VaccineExpenseCleanupError);
  expect(await pc.vaccines.getVaccineList()).toEqual([]);
  expect(await pc.repository.getAllRecords('expenses')).toEqual([
    expect.objectContaining({ id: expense.id, amount: '3200', sourceId: String(vaccine.id) }),
  ]);
  expect(JSON.parse(await raw(farmFile('vaccines-sync.json')))[0]).toMatchObject({ deletedAt: expect.any(String) });
  expect(JSON.parse(await raw(farmFile('expenses-sync.json')))[0].deletedAt).toBeUndefined();
  // The ordinary expense action can finish the reported cleanup; no vaccine is recreated.
  failDelete = undefined;
  await pc.expenses.deleteExpense(expense.id);
  expect(await pc.expenses.getExpensesList({ requireCloudSync: true })).toEqual([]);
  expect(await pc.vaccines.getVaccineList()).toEqual([]);
}, 20000);

it('rejects a subsequent save when a lost deletion response concealed the server tombstone', async () => {
  const pc = await browser(0);
  const { vaccine, expense } = await saveVaccination(pc);
  const expenseBefore = await raw(farmFile('expenses-sync.json'));
  loseVaccineDeleteResponse = true;
  await expect(pc.vaccines.deleteVaccine(vaccine.id)).rejects.toThrow();
  expect(await pc.repository.getAllRecords('vaccines')).toHaveLength(1);
  expect(await pc.repository.getAllRecords('expenses')).toHaveLength(1);
  expect(JSON.parse(await raw(farmFile('vaccines-sync.json')))[0].deletedAt).toBeTruthy();

  await expect(pc.vaccines.updateVaccine(vaccine.id, { ...vaccineInput, vaccineCost: '4900', note: 'Save after lost DELETE response' }))
    .rejects.toThrow(/削除/);
  expect(await raw(farmFile('expenses-sync.json'))).toBe(expenseBefore);
  expect(await pc.repository.getAllRecords('expenses')).toEqual([
    expect.objectContaining({ id: expense.id, amount: '3200' }),
  ]);
  expect(JSON.parse(await raw(farmFile('vaccines-sync.json')))[0].deletedAt).toBeTruthy();
}, 20000);

it('keeps a lost DELETE acknowledgement visible across reloads until explicit retry completes both vaccine and fee deletion', async () => {
  let pc = await browser(0);
  const { vaccine, expense } = await saveVaccination(pc);
  const expenseBefore = await raw(farmFile('expenses-sync.json'));
  loseVaccineDeleteResponse = true;
  await expect(pc.vaccines.deleteVaccine(vaccine.id)).rejects.toThrow();
  const pending = await pc.repository.getRecordById('vaccines', vaccine.id);
  expect(pending).toMatchObject({ id: vaccine.id, vaccineSyncDeletePending: true });
  const tombstone = await raw(farmFile('vaccines-sync.json'));
  expect(JSON.parse(tombstone)[0].deletedAt).toBeTruthy();
  const start = requests.length;
  pc = await browser(0, pc.factory);

  expect(await pc.vaccines.getVaccineList()).toEqual([pending]);
  expect(await pc.vaccines.getVaccineList()).toEqual([pending]);
  expect(pc.vaccines.getVaccineSyncStatus(pending as unknown as import('../types/vaccine').Vaccine)).toMatchObject({
    pending: false, warning: expect.stringMatching(/もう一度削除/),
  });
  expect(await pc.vaccines.retryPendingVaccineSync()).toBe(0);
  expect(await raw(farmFile('expenses-sync.json'))).toBe(expenseBefore);
  expect(await pc.repository.getRecordById('expenses', expense.id)).toBeDefined();
  expect(requests.slice(start).every(request => request.method === 'GET')).toBe(true);

  await pc.vaccines.deleteVaccine(vaccine.id);

  expect(await pc.vaccines.getVaccineList()).toEqual([]);
  expect(await pc.repository.getRecordById('expenses', expense.id)).toBeUndefined();
  expect(await raw(farmFile('vaccines-sync.json'))).toBe(tombstone);
  expect(JSON.parse(await raw(farmFile('expenses-sync.json')))).toEqual([
    expect.objectContaining({ id: `expense:${expense.id}`, deletedAt: expect.any(String), amount: '3200' }),
  ]);
  expect(requests.slice(start).filter(request => request.method === 'PUT')).toEqual([]);
  const phone = await browser(1);
  expect(await phone.vaccines.getVaccineList()).toEqual([]);
  expect(await phone.expenses.getExpensesList({ requireCloudSync: true })).toEqual([]);
}, 20000);

it('acknowledges a lost vaccine PUT response by reading the same ID without sending another write or changing the accepted generation', async () => {
  const pc = await browser(0);
  loseVaccineSaveResponse = true;
  const saved = await pc.vaccines.createVaccine({ ...vaccineInput, vaccineCost: '', note: 'Accepted once, response lost' });
  expect(await pc.repository.getRecordById('vaccines', saved.id)).toMatchObject({ cloudSyncPending: true });
  const accepted = await raw(farmFile('vaccines-sync.json'));
  expect(JSON.parse(accepted)).toHaveLength(1);
  const start = requests.length;

  expect(await pc.vaccines.retryPendingVaccineSync()).toBe(1);

  expect(await raw(farmFile('vaccines-sync.json'))).toBe(accepted);
  expect(requests.slice(start).every(request => request.method === 'GET')).toBe(true);
  expect(requests.slice(start)).toContainEqual(expect.objectContaining({
    pathname: `/api/vaccines/record-sync/${encodeURIComponent(`vaccine:${saved.id}`)}`, status: 200,
  }));
  expect(requests.filter(request => request.method === 'PUT')).toHaveLength(1);
  expect(await pc.repository.getRecordById('vaccines', saved.id)).toMatchObject({ cloudSyncPending: false });
  const phone = await browser(1);
  expect(await phone.vaccines.getVaccineList()).toMatchObject([
    { id: saved.id, note: 'Accepted once, response lost', vaccineCost: '', cloudSyncPending: false },
  ]);
  const cloud = JSON.parse(accepted)[0];
  for (const field of ['cloudSyncPending', 'syncWarning', 'vaccineSyncOrigin', 'vaccineSyncBase', 'vaccineSyncAttempt', 'vaccineSyncLocalOnly']) {
    expect(cloud).not.toHaveProperty(field);
  }
}, 20000);

it('keeps an offline edit pending when another browser edits and then deletes the same vaccine', async () => {
  let pc = await browser(0);
  const saved = await pc.vaccines.createVaccine({ ...vaccineInput, vaccineCost: '' });
  let phone = await browser(1);
  expect(await phone.vaccines.getVaccineList()).toHaveLength(1);
  pc = await browser(0, pc.factory);
  offline = true;
  await pc.vaccines.updateVaccine(saved.id, { ...vaccineInput, vaccineCost: '', note: 'PC offline edit must survive' });
  const pending = await pc.repository.getRecordById('vaccines', saved.id);
  offline = false;
  phone = await browser(1, phone.factory);
  await phone.vaccines.updateVaccine(saved.id, { ...vaccineInput, vaccineCost: '', note: 'Phone accepted edit' });
  const cloudEdit = await raw(farmFile('vaccines-sync.json'));
  pc = await browser(0, pc.factory);
  let start = requests.length;
  await pc.vaccines.retryPendingVaccineSync();
  await pc.vaccines.getVaccineList();
  expect(await pc.repository.getRecordById('vaccines', saved.id)).toMatchObject({
    note: 'PC offline edit must survive', vaccineCost: '', cloudSyncPending: true, syncWarning: expect.any(String),
    createdAt: pending?.createdAt, updatedAt: pending?.updatedAt,
  });
  expect(await raw(farmFile('vaccines-sync.json'))).toBe(cloudEdit);
  expect(requests.slice(start).every(request => request.method === 'GET')).toBe(true);

  phone = await browser(1, phone.factory);
  await phone.vaccines.deleteVaccine(saved.id);
  const cloudDeleted = await raw(farmFile('vaccines-sync.json'));
  expect(JSON.parse(cloudDeleted)[0].deletedAt).toBeTruthy();
  pc = await browser(0, pc.factory);
  start = requests.length;
  await pc.vaccines.retryPendingVaccineSync();
  await pc.vaccines.getVaccineList();
  expect(await pc.repository.getRecordById('vaccines', saved.id)).toMatchObject({
    note: 'PC offline edit must survive', cloudSyncPending: true, syncWarning: expect.stringMatching(/削除/),
  });
  expect(await raw(farmFile('vaccines-sync.json'))).toBe(cloudDeleted);
  expect(requests.slice(start).every(request => request.method === 'GET')).toBe(true);
  expect(JSON.parse(await raw(farmFile('expenses-sync.json')))).toEqual([]);
}, 20000);

it('does not delete a vaccine or its related fee from a stale browser after another browser accepted an edit', async () => {
  let pc = await browser(0);
  const { vaccine } = await saveVaccination(pc);
  const phone = await browser(1);
  expect(await phone.vaccines.getVaccineList()).toHaveLength(1);
  await phone.vaccines.updateVaccine(vaccine.id, { ...vaccineInput, note: 'Phone edit before stale deletion' });
  const cloudBefore = await Promise.all(['vaccines-sync.json', 'expenses-sync.json', 'settlement-sync.json'].map(name => raw(farmFile(name))));
  pc = await browser(0, pc.factory);
  const localVaccine = await pc.repository.getRecordById('vaccines', vaccine.id);
  const localExpenses = expenseContent(await pc.repository.getAllRecords('expenses'));
  const start = requests.length;

  await expect(pc.vaccines.deleteVaccine(vaccine.id)).rejects.toThrow(/変更|競合|確認/);

  expect(await pc.repository.getRecordById('vaccines', vaccine.id)).toMatchObject({
    id: vaccine.id, note: localVaccine?.note, vaccineCost: localVaccine?.vaccineCost,
  });
  expect(expenseContent(await pc.repository.getAllRecords('expenses'))).toEqual(localExpenses);
  expect(await Promise.all(['vaccines-sync.json', 'expenses-sync.json', 'settlement-sync.json'].map(name => raw(farmFile(name))))).toEqual(cloudBefore);
  expect(requests.slice(start).filter(request => request.method !== 'GET')).toEqual([]);
}, 20000);
