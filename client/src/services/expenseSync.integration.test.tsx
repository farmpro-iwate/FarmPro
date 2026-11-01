import { afterEach, expect, it, vi } from 'vitest';
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
import { AppLayout } from '../components/AppLayout';
import { ExpenseList } from '../pages/ExpenseList';
import { openFarmProDatabase } from '../storage/db';
import { getAllRecords, getRecordById } from '../storage/repository';
import { createExpense, retryUnsentExpenses, type ExpenseInput, type ExpenseRecord } from './expensesApi';

// Real UI, application services, authentication and HTTP handlers. Only the
// browser transport boundary simulates disconnection and resolves relative URLs.
const express = createRequire(path.resolve(process.cwd(), '../server/package.json'))('express');
const nativeFetch = globalThis.fetch;
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
let previousEnv: Record<string, string | undefined>;
let root = '';
let server: Server | undefined;
const opened: IDBDatabase[] = [];

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const database of opened) database.close();
  opened.length = 0;
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  if (root) {
    expect(root.startsWith(path.join(os.tmpdir(), 'farmpro-expense-flow-'))).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  }
  for (const key of envKeys) {
    if (previousEnv?.[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
  window.localStorage.clear();
  window.sessionStorage.clear();
});

it('recovers one formal ET fee through real reconnect UI and authenticated HTTP, retaining its content on reload and another browser', async () => {
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-expense-flow-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'fixture-expense-flow-secret';
  process.env.NODE_ENV = 'test';
  const farmId = 'farm-expense-flow-fixture';
  const otherFarmId = 'farm-other-expense-fixture';
  const credentials = createPasswordHash('fixture-expense-flow-password');
  const users: FarmProUser[] = ['pc', 'phone', 'other-farm'].map(device => ({
    id: `expense-${device}-fixture`, farmId: device === 'other-farm' ? otherFarmId : farmId,
    farmName: 'Fixture Farm', name: 'Fixture User', email: `${device}@example.invalid`,
    role: 'owner', plan: 'standard', active: true, ...credentials,
  }));
  const authUser = (user: FarmProUser): AuthUser => {
    const { passwordHash: _hash, passwordSalt: _salt, ...data } = user;
    return { ...data, plan: user.plan || 'free' };
  };
  const signIn = (user: FarmProUser) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('farmpro.authUser', JSON.stringify(authUser(user)));
    window.localStorage.setItem('farmpro.authToken', createToken(authUser(user)));
  };
  const put = async (name: string, data: unknown) => {
    const destination = path.join(root, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, JSON.stringify(data), 'utf8');
  };
  const farmFile = (name: string) => `farms/${farmId}/${name}`;
  const raw = (name: string) => fs.readFile(path.join(root, name), 'utf8');
  await put('users.json', users);
  await put('stripeSubscriptions.json', [{ id: 'protected-contract-fixture' }]);
  await put('bank-transfer-applications.json', [{ id: 'protected-billing-fixture' }]);
  await put(farmFile('expenses-sync.json'), []);
  await put(farmFile('settlement-sync.json'), []);
  await put(farmFile('cattle.json'), [{ id: 'protected-cow-fixture' }]);
  await put(`farms/${otherFarmId}/expenses-sync.json`, [{ id: 'expense:other-farm', amount: '777' }]);
  await put(`farms/${otherFarmId}/settlement-sync.json`, []);
  const protectedFiles = ['users.json', 'stripeSubscriptions.json', 'bank-transfer-applications.json',
    farmFile('settlement-sync.json'), farmFile('cattle.json'),
    `farms/${otherFarmId}/expenses-sync.json`, `farms/${otherFarmId}/settlement-sync.json`];
  const beforeProtected = await Promise.all(protectedFiles.map(raw));

  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/expenses', expensesRouter);
  server = app.listen(0, '127.0.0.1') as Server;
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server failed to bind');
  const origin = `http://127.0.0.1:${address.port}`;
  let online = false;
  let stage = 'pc';
  const requests: Array<{ stage: string; method: string; pathname: string; condition: string | null; status?: number }> = [];
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(requested, origin);
    expect(url.origin).toBe(origin);
    expect(url.pathname.startsWith('/api/')).toBe(true);
    const request = { stage, method: init?.method || 'GET', pathname: url.pathname,
      condition: new Headers(init?.headers).get('If-None-Match'), status: undefined as number | undefined };
    requests.push(request);
    if (!online && url.pathname.startsWith('/api/expenses/record-sync')) {
      throw new TypeError('fixture: disconnected before sending the expense request');
    }
    const response = await nativeFetch(url.href, init);
    request.status = response.status;
    return response;
  });

  const pcFactory = new IDBFactory();
  vi.stubGlobal('indexedDB', pcFactory);
  signIn(users[0]);
  window.history.replaceState(null, '', '/expenses');
  const fee: ExpenseInput = {
    paymentDate: '2026-11-01', category: '種付け・繁殖費', description: '移植料',
    vendor: 'Fixture Technician', amount: '10000', paymentMethod: '', target: 'Fixture Cow',
    animalType: 'cattle', animalEarTag: 'FIXTURE-COW', animalName: 'Fixture Cow',
    sourceType: 'breeding', sourceId: 'fixture-et-record', sourceDetail: 'transfer-procedure',
    memo: 'One formally saved ET fee',
  };
  const saved = await createExpense(fee);
  opened.push(await openFarmProDatabase());
  const cloudId = `expense:${saved.id}`;
  const uploadPath = `/api/expenses/record-sync/${encodeURIComponent(cloudId)}`;
  expect(await getAllRecords('expenses')).toEqual([
    expect.objectContaining({ ...fee, id: saved.id, syncRecordId: cloudId, cloudSyncPending: true }),
  ]);
  expect(JSON.parse(await raw(farmFile('expenses-sync.json')))).toEqual([]);
  expect(requests.filter(row => row.method === 'PUT')).toEqual([
    { stage: 'pc', method: 'PUT', pathname: uploadPath, condition: null, status: undefined },
  ]);

  const page = render(<MemoryRouter initialEntries={['/expenses']}>
    <AppLayout><ExpenseList /></AppLayout>
  </MemoryRouter>);
  await screen.findByText('同期確認待ちの経費が1件あります。記録はこの端末に保存されています。');
  online = true;
  fireEvent(window, new Event('online'));
  await waitFor(() => expect(screen.queryByText(/同期確認待ちの経費が/)).not.toBeInTheDocument());
  const content = { ...fee, createdAt: saved.createdAt, updatedAt: saved.updatedAt };
  const pcRecord = await getRecordById<ExpenseRecord>('expenses', saved.id);
  expect(pcRecord).toMatchObject({ id: saved.id, syncRecordId: cloudId, cloudSyncPending: false });
  expect(pcRecord).not.toHaveProperty('expenseRetryOrigin');
  expect.soft(pcRecord).toMatchObject(content);
  const serverRows = JSON.parse(await raw(farmFile('expenses-sync.json')));
  expect(serverRows).toHaveLength(1);
  expect(serverRows[0]).toMatchObject({ ...content, id: cloudId });
  const cloudAfterSave = await raw(farmFile('expenses-sync.json'));

  fireEvent(window, new Event('online'));
  fireEvent(window, new Event('focus'));
  await retryUnsentExpenses(); // Join the real event-triggered batch before closing the browser.
  expect(requests.filter(row => row.method === 'PUT')).toEqual([
    { stage: 'pc', method: 'PUT', pathname: uploadPath, condition: null, status: undefined },
    { stage: 'pc', method: 'PUT', pathname: uploadPath, condition: '*', status: 200 },
  ]);
  page.unmount();

  // Reload application modules and reopen the same browser's retained database.
  const beforeReload = await getAllRecords('expenses');
  const storedAuth = window.localStorage.getItem('farmpro.authUser');
  opened[0].close();
  vi.resetModules();
  stage = 'pc-reload';
  vi.stubGlobal('indexedDB', pcFactory);
  const reloadedRepository = await import('../storage/repository');
  const reloadedExpenses = await import('./expensesApi');
  expect(window.localStorage.getItem('farmpro.authUser')).toBe(storedAuth);
  expect(await reloadedRepository.getAllRecords('expenses')).toEqual(beforeReload);
  const afterReload = await reloadedExpenses.getExpensesList({ requireCloudSync: true });
  expect(afterReload).toHaveLength(1);
  expect.soft(afterReload[0]).toMatchObject({ ...content, id: saved.id, syncRecordId: cloudId });
  opened.push(await (await import('../storage/db')).openFarmProDatabase());

  // Another IndexedDB factory represents a separate browser, with no copied PC state.
  opened[1].close();
  vi.resetModules();
  stage = 'phone';
  vi.stubGlobal('indexedDB', new IDBFactory());
  signIn(users[1]);
  const phoneRepository = await import('../storage/repository');
  const phoneExpenses = await import('./expensesApi');
  expect(await phoneRepository.getAllRecords('expenses')).toEqual([]);
  const phoneRows = await phoneExpenses.getExpensesList({ requireCloudSync: true });
  const phoneRowsAgain = await phoneExpenses.getExpensesList({ requireCloudSync: true });
  expect(phoneRows).toHaveLength(1);
  expect(phoneRowsAgain).toHaveLength(1);
  expect.soft(phoneRows[0]).toMatchObject({ ...content, id: saved.id, syncRecordId: cloudId, cloudSyncPending: false });
  expect.soft(phoneRowsAgain[0]).toMatchObject({ ...content, id: saved.id, syncRecordId: cloudId });
  expect(requests.filter(row => row.stage === 'phone').map(row => row.method)).toEqual(['GET', 'GET']);
  expect(requests.filter(row => row.stage === 'pc-reload').every(row => row.method === 'GET')).toBe(true);
  opened.push(await (await import('../storage/db')).openFarmProDatabase());

  stage = 'other-farm';
  const otherResponse = await fetch(`${origin}/api/expenses/record-sync`, {
    headers: { Authorization: `Bearer ${createToken(authUser(users[2]))}` },
  });
  expect(otherResponse.status).toBe(200);
  expect((await otherResponse.json()).map((row: { id: string }) => row.id)).toEqual(['expense:other-farm']);
  expect(await raw(farmFile('expenses-sync.json'))).toBe(cloudAfterSave);
  expect(await Promise.all(protectedFiles.map(raw))).toEqual(beforeProtected);
}, 20000);
