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
import { treatmentsRouter } from '../../../server/src/routes/treatments';
import type { ExpenseInput } from './expensesApi';
import type { Treatment, TreatmentInput } from '../types/treatment';

// The UI, client services, authentication and farm-scoped stores are real.
// The transport holds only a response from the local fixture HTTP server.
const express = createRequire(path.resolve(process.cwd(), '../server/package.json'))('express');
const nativeFetch = globalThis.fetch;
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
const farmId = 'farm-treatment-race-fixture';
const otherFarmId = 'farm-other-treatment-fixture';
const treatmentInput: TreatmentInput = {
  recordType: '治療', targetNumber: 'FIXTURE-COW', targetName: '治療競合の試験牛',
  symptom: '試験用の症状', diagnosis: '', treatmentProcedure: '', treatmentDate: '2026-11-02',
  medicine: '試験薬', medicineSource: 'veterinarian', dosage: '2', medicineCost: '1200', medicalFee: '3400',
  withdrawalEndDate: '', veterinarian: '試験獣医師', progress: '経過観察', note: '独立した検証専用記録',
};
let previousEnv: Record<string, string | undefined>;
let root = '';
let server: Server | undefined;
let database: IDBDatabase | undefined;
let users: FarmProUser[] = [];
let requests: Array<{ method: string; pathname: string; status?: number }>;
let protectedFiles: string[];
let protectedBefore: string[];
let holdDelete = false;
let loseDeleteResponse = false;
let deleteArrived: () => void;
let deleteArrival: Promise<void>;
let releaseDelete: () => void;
let deleteRelease: Promise<void>;
let holdPut = false;
let putArrived: () => void;
let putArrival: Promise<void>;
let releasePut: () => void;
let putRelease: Promise<void>;
let fixtureOrigin = '';

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
async function browser(device = 0, factory = new IDBFactory()) {
  cleanup();
  database?.close();
  vi.resetModules();
  vi.stubGlobal('indexedDB', factory);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(authUser(users[device])));
  window.localStorage.setItem('farmpro.authToken', createToken(authUser(users[device])));
  const treatments = await import('./treatmentApi');
  const expenses = await import('./expensesApi');
  const repository = await import('../storage/repository');
  database = await (await import('../storage/db')).openFarmProDatabase();
  return { treatments, expenses, repository, factory, databaseName: database.name };
}
async function showTreatmentList() {
  const { TreatmentList } = await import('../pages/TreatmentList');
  return render(<MemoryRouter initialEntries={['/treatments']}><TreatmentList /></MemoryRouter>);
}
async function saveTreatmentAndExpenses(client: Awaited<ReturnType<typeof browser>>) {
  const treatment = await client.treatments.createTreatment(treatmentInput);
  const common: Omit<ExpenseInput, 'category' | 'amount'> = {
    paymentDate: treatmentInput.treatmentDate, description: '試験用の治療費', vendor: treatmentInput.veterinarian,
    paymentMethod: '', target: treatmentInput.targetName, sourceType: 'treatment', sourceId: String(treatment.id),
    memo: '検証専用の関連経費',
  };
  const medicine = await client.expenses.createExpense({ ...common, category: '医薬品費', amount: treatmentInput.medicineCost! });
  const medical = await client.expenses.createExpense({ ...common, category: '診療費', amount: treatmentInput.medicalFee! });
  return { treatment, medicine, medical };
}
async function independentWriter(factory: IDBFactory, databaseName: string, record: Treatment) {
  await new Promise<void>((resolve, reject) => {
    const request = factory.open(databaseName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const connection = request.result;
      const transaction = connection.transaction('treatments', 'readwrite');
      transaction.objectStore('treatments').put(record);
      transaction.oncomplete = () => { connection.close(); resolve(); };
      transaction.onerror = () => { connection.close(); reject(transaction.error); };
    };
  });
}

beforeEach(async () => {
  window.history.replaceState(null, '', '/treatments');
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-treatment-race-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'fixture-treatment-race-secret';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('fixture-treatment-race-password');
  users = ['pc', 'phone'].map(device => ({
    id: `treatment-${device}-fixture`, farmId, farmName: 'Fixture Farm', name: 'Fixture User',
    email: `${device}@example.invalid`, role: 'owner', plan: 'standard', active: true, ...credentials,
  }));
  await put('users.json', users);
  await put('stripeSubscriptions.json', [{ id: 'protected-contract-fixture' }]);
  await put('bank-transfer-applications.json', [{ id: 'protected-billing-fixture' }]);
  await put(farmFile('treatments-sync.json'), []);
  await put(farmFile('expenses-sync.json'), []);
  await put(farmFile('settlement-sync.json'), []);
  await put(farmFile('cattle.json'), [{ id: 'protected-cow-fixture' }]);
  await put(`farms/${otherFarmId}/treatments-sync.json`, [{ id: 'treatment:777', note: 'Other Farm' }]);
  await put(`farms/${otherFarmId}/expenses-sync.json`, [{ id: 'expense:other-farm', amount: '777' }]);
  protectedFiles = ['users.json', 'stripeSubscriptions.json', 'bank-transfer-applications.json',
    farmFile('cattle.json'), `farms/${otherFarmId}/treatments-sync.json`, `farms/${otherFarmId}/expenses-sync.json`];
  protectedBefore = await Promise.all(protectedFiles.map(raw));
  requests = [];
  holdDelete = false;
  loseDeleteResponse = false;
  holdPut = false;
  deleteArrival = new Promise(resolve => { deleteArrived = resolve; });
  deleteRelease = new Promise(resolve => { releaseDelete = resolve; });
  putArrival = new Promise(resolve => { putArrived = resolve; });
  putRelease = new Promise(resolve => { releasePut = resolve; });
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/treatments', treatmentsRouter);
  app.use('/api/expenses', expensesRouter);
  server = app.listen(0, '127.0.0.1') as Server;
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server failed to bind');
  const origin = `http://127.0.0.1:${address.port}`;
  fixtureOrigin = origin;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(requested, origin);
    expect(url.origin).toBe(origin);
    expect(url.pathname.startsWith('/api/')).toBe(true);
    const request = { method: init?.method || 'GET', pathname: url.pathname, status: undefined as number | undefined };
    requests.push(request);
    if (holdPut && request.method === 'PUT' && url.pathname.startsWith('/api/treatments/record-sync/')) {
      putArrived();
      await putRelease;
    }
    const response = await nativeFetch(url.href, init);
    request.status = response.status;
    if (loseDeleteResponse && request.method === 'DELETE' && url.pathname.startsWith('/api/treatments/record-sync/')) {
      loseDeleteResponse = false;
      throw new TypeError('Fixture: treatment deleted, but its response was lost');
    }
    if (holdDelete && request.method === 'DELETE' && url.pathname.startsWith('/api/treatments/record-sync/')) {
      deleteArrived();
      await deleteRelease;
    }
    return response;
  });
});

afterEach(async () => {
  releaseDelete?.();
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
      expect(root.startsWith(path.join(os.tmpdir(), 'farmpro-treatment-race-'))).toBe(true);
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

it('keeps a treatment edited by an independent tab while DELETE is awaiting its HTTP response, shows the conflict and preserves both linked expenses', async () => {
  const client = await browser();
  const { treatment, medicine, medical } = await saveTreatmentAndExpenses(client);
  const user = userEvent.setup();
  await showTreatmentList();
  await screen.findByText('表示：1件 / 全1件');
  holdDelete = true;
  await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
  await deleteArrival;
  const before = await client.repository.getRecordById<Treatment>('treatments', treatment.id);
  expect(before).toBeDefined();
  const changed = { ...before!, note: '別タブで保留中に追記', medicineCost: '2300', medicalFee: '4500',
    updatedAt: '2026-11-02T23:45:00.000Z', cloudSyncPending: true };
  await independentWriter(client.factory, client.databaseName, changed);
  await act(async () => { releaseDelete(); });
  await waitFor(() => {
    const stoppedWithConflict = screen.queryByRole('alert') !== null;
    const completedDeletion = requests.filter(request => request.method === 'GET'
      && request.pathname === '/api/treatments/record-sync' && request.status === 200).length >= 2;
    expect(stoppedWithConflict || completedDeletion).toBe(true);
    expect(requests.filter(request => request.status === undefined)).toEqual([]);
  });

  expect.soft(await client.repository.getRecordById('treatments', treatment.id)).toEqual(changed);
  expect.soft(screen.queryByRole('alert')).not.toBeNull();
  expect.soft(screen.queryByText('表示：1件 / 全1件')).not.toBeNull();
  expect.soft(await client.repository.getRecordById('expenses', medicine.id)).toMatchObject({ amount: '1200' });
  expect.soft(await client.repository.getRecordById('expenses', medical.id)).toMatchObject({ amount: '3400' });
  expect.soft(requests.filter(request => request.method === 'DELETE' && request.pathname.startsWith('/api/expenses/'))).toEqual([]);
  const cloudExpenses = JSON.parse(await raw(farmFile('expenses-sync.json')));
  expect.soft(cloudExpenses).toHaveLength(2);
  expect.soft(cloudExpenses.every((expense: { deletedAt?: string }) => !expense.deletedAt)).toBe(true);
  const cloudTreatments = JSON.parse(await raw(farmFile('treatments-sync.json')));
  expect(cloudTreatments[0].deletedAt).toBeTruthy();
}, 20000);

it('deletes an unchanged treatment and both linked expenses through the real list, then confirms their tombstones from an independent browser', async () => {
  const client = await browser();
  const { treatment, medicine, medical } = await saveTreatmentAndExpenses(client);
  const user = userEvent.setup();
  await showTreatmentList();
  await screen.findByText('表示：1件 / 全1件');
  await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
  await screen.findByText('表示：0件 / 全0件');
  await waitFor(async () => expect(await client.repository.getAllRecords('expenses')).toEqual([]));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(await client.repository.getRecordById('treatments', treatment.id)).toBeUndefined();
  expect(await client.repository.getRecordById('expenses', medicine.id)).toBeUndefined();
  expect(await client.repository.getRecordById('expenses', medical.id)).toBeUndefined();
  expect(requests.filter(request => request.method === 'DELETE' && request.pathname.startsWith('/api/treatments/'))).toHaveLength(1);
  expect(requests.filter(request => request.method === 'DELETE' && request.pathname.startsWith('/api/expenses/'))).toHaveLength(2);
  const phone = await browser(1);
  expect(await phone.treatments.getTreatmentList()).toEqual([]);
  expect(await phone.expenses.getExpensesList()).toEqual([]);
  expect(JSON.parse(await raw(farmFile('treatments-sync.json')))[0].deletedAt).toBeTruthy();
  const cloudExpenses = JSON.parse(await raw(farmFile('expenses-sync.json')));
  expect(cloudExpenses).toHaveLength(2);
  expect(cloudExpenses.every((expense: { deletedAt?: string }) => Boolean(expense.deletedAt))).toBe(true);
}, 20000);

it('retains the treatment and both expenses after a lost DELETE response and a list reload, then completes cleanup on the next explicit deletion', async () => {
  const client = await browser();
  const { treatment, medicine, medical } = await saveTreatmentAndExpenses(client);
  const user = userEvent.setup();
  const firstView = await showTreatmentList();
  await screen.findByText('表示：1件 / 全1件');
  const before = await client.repository.getRecordById<Treatment>('treatments', treatment.id);
  loseDeleteResponse = true;
  await user.click(screen.getAllByRole('button', { name: '削除' })[0]);

  expect(await screen.findByRole('alert')).toHaveTextContent('治療記録の削除を確認できませんでした');
  expect(screen.getByText('表示：1件 / 全1件')).toBeInTheDocument();
  expect(await client.repository.getRecordById('treatments', treatment.id)).toEqual({ ...before, cloudSyncPending: true });
  expect(await client.repository.getRecordById('expenses', medicine.id)).toMatchObject({ amount: '1200' });
  expect(await client.repository.getRecordById('expenses', medical.id)).toMatchObject({ amount: '3400' });
  expect(requests.filter(request => request.method === 'DELETE' && request.pathname.startsWith('/api/expenses/'))).toEqual([]);
  expect(JSON.parse(await raw(farmFile('treatments-sync.json')))[0].deletedAt).toBeTruthy();
  expect(JSON.parse(await raw(farmFile('expenses-sync.json'))).every((record: { deletedAt?: string }) => !record.deletedAt)).toBe(true);

  firstView.unmount();
  await showTreatmentList();
  await screen.findByText('表示：1件 / 全1件');
  expect(await client.repository.getRecordById('treatments', treatment.id)).toEqual({ ...before, cloudSyncPending: true });
  expect(await client.repository.getAllRecords('expenses')).toHaveLength(2);
  await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
  await screen.findByText('表示：0件 / 全0件');
  await waitFor(async () => expect(await client.repository.getAllRecords('expenses')).toEqual([]));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(await client.repository.getRecordById('treatments', treatment.id)).toBeUndefined();
  expect(requests.filter(request => request.method === 'DELETE' && request.pathname.startsWith('/api/treatments/'))).toHaveLength(2);
  expect(requests.filter(request => request.method === 'DELETE' && request.pathname.startsWith('/api/expenses/'))).toHaveLength(2);
  const cloudExpenses = JSON.parse(await raw(farmFile('expenses-sync.json')));
  expect(cloudExpenses).toHaveLength(2);
  expect(cloudExpenses.every((record: { deletedAt?: string }) => Boolean(record.deletedAt))).toBe(true);
}, 20000);

it('shows a tombstone PUT acknowledgement in the real edit form without changing either linked expense or leaving the form', async () => {
  const client = await browser();
  const { treatment, medicine, medical } = await saveTreatmentAndExpenses(client);
  const expensesBefore = await raw(farmFile('expenses-sync.json'));
  const { TreatmentForm } = await import('../pages/TreatmentForm');
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[`/treatments/${treatment.id}/edit?returnTo=/finished`]}>
    <Routes>
      <Route path="/treatments/:id/edit" element={<TreatmentForm mode="edit" />} />
      <Route path="/finished" element={<div>保存後の画面へ移動した</div>} />
    </Routes>
  </MemoryRouter>);
  const medicineCost = await screen.findByLabelText('医薬品費（円）');
  await user.clear(medicineCost);
  await user.type(medicineCost, '2300');
  await user.clear(screen.getByLabelText('診療費（円）'));
  await user.type(screen.getByLabelText('診療費（円）'), '4500');
  const writesBefore = requests.filter(request => request.method !== 'GET' && request.pathname.startsWith('/api/expenses/')).length;
  holdPut = true;
  await user.click(screen.getByRole('button', { name: '保存' }));
  await putArrival;

  // A different authenticated device deletes on the real server while the form's PUT is delayed.
  const peerDelete = await nativeFetch(`${fixtureOrigin}/api/treatments/record-sync/${encodeURIComponent(`treatment:${treatment.id}`)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${createToken(authUser(users[1]))}` },
  });
  expect(peerDelete.status).toBe(200);
  expect((await peerDelete.json() as { deletedAt?: string }).deletedAt).toBeTruthy();
  await act(async () => { releasePut(); });

  expect(await screen.findByText(/削除済み/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  expect(screen.queryByText('保存後の画面へ移動した')).not.toBeInTheDocument();
  expect(await client.repository.getRecordById('treatments', treatment.id)).toMatchObject({
    medicineCost: '2300', medicalFee: '4500', cloudSyncPending: true,
  });
  expect(await client.repository.getRecordById('expenses', medicine.id)).toMatchObject({ amount: '1200' });
  expect(await client.repository.getRecordById('expenses', medical.id)).toMatchObject({ amount: '3400' });
  expect(await raw(farmFile('expenses-sync.json'))).toBe(expensesBefore);
  expect(requests.filter(request => request.method !== 'GET' && request.pathname.startsWith('/api/expenses/'))).toHaveLength(writesBefore);
  expect(JSON.parse(await raw(farmFile('treatments-sync.json')))[0].deletedAt).toBeTruthy();
}, 20000);
