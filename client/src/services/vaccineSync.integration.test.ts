import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
let requests: Array<{ method: string; pathname: string; status?: number }>;
let protectedFiles: string[];
let protectedBefore: string[];

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
  database?.close();
  vi.resetModules();
  vi.stubGlobal('indexedDB', factory);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(authUser(users[device])));
  window.localStorage.setItem('farmpro.authToken', createToken(authUser(users[device])));
  const vaccines = await import('./vaccineApi');
  const expenses = await import('./expensesApi');
  const repository = await import('../storage/repository');
  database = await (await import('../storage/db')).openFarmProDatabase();
  return { vaccines, expenses, repository, factory };
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
  server = app.listen(0, '127.0.0.1') as Server;
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server failed to bind');
  const origin = `http://127.0.0.1:${address.port}`;
  requests = [];
  failDelete = undefined;
  loseExpenseSaveResponse = false;
  loseVaccineDeleteResponse = false;
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(requested, origin);
    expect(url.origin).toBe(origin);
    expect(url.pathname.startsWith('/api/')).toBe(true);
    const request = { method: init?.method || 'GET', pathname: url.pathname, status: undefined as number | undefined };
    requests.push(request);
    if (request.method === 'DELETE' && failDelete && url.pathname.startsWith(`/api/${failDelete}s/record-sync/`)) {
      request.status = 503;
      return Response.json({ message: 'Fixture: deletion unavailable' }, { status: 503 });
    }
    const response = await nativeFetch(url.href, init);
    request.status = response.status;
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

afterEach(async () => {
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
  expect(await pc.repository.getAllRecords('vaccines')).toEqual(beforeVaccines);
  expect(expenseContent(await pc.repository.getAllRecords('expenses'))).toEqual(expenseContent(beforeExpenses));
  expect(await Promise.all(['vaccines-sync.json', 'expenses-sync.json', 'settlement-sync.json'].map(name => raw(farmFile(name))))).toEqual(cloudBefore);
  expect(requests.slice(requestStart).filter(row => row.method === 'DELETE')).toEqual([
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
