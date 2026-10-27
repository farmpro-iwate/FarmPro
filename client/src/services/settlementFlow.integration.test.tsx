import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import salesRouter from '../../../server/src/routes/sales';
import { ManualSettlementReview } from '../pages/ManualSettlementReview';
import { SalesList } from '../pages/SalesList';
import { openFarmProDatabase } from '../storage/db';
import { getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import { getSalesList, type SaleRecord } from './salesApi';
import { getExpensesList, getAnimalExpenseTotals } from './expensesApi';
import { checkCloudSettlementStatus, getCloudSettlementDetails } from './cloudSettlementStatus';
import { settlementProfit, settlementSellingFees } from './settlementSellingFees';
import { getOrCreateSaleCostSnapshot } from './saleCostSnapshot';

// No application service is mocked. The only boundary adaptation turns browser
// relative /api URLs into this disposable loopback server's absolute URLs.
const express = createRequire(path.resolve(process.cwd(), '../server/package.json'))('express');
const nativeFetch = globalThis.fetch;
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
let previousEnv: Record<string, string | undefined>;
let root: string;
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
    expect(root.startsWith(path.join(os.tmpdir(), 'farmpro-settlement-flow-'))).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  }
  for (const key of envKeys) {
    if (previousEnv?.[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
  window.localStorage.clear();
  window.sessionStorage.clear();
});

it('confirms in the real UI, saves through authenticated HTTP, imports expenses, and shows 290000 on two independent devices', async () => {
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-flow-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'fixture-cross-layer-secret';
  process.env.NODE_ENV = 'test';
  const farmId = 'farm-cross-layer-fixture';
  const credentials = createPasswordHash('fixture-cross-layer-password');
  const users: FarmProUser[] = ['pc', 'phone'].map(device => ({
    id: `user-${device}-fixture`, farmId, farmName: 'Fixture Farm', name: 'Fixture User',
    email: `${device}@example.invalid`, role: 'owner', plan: 'standard', active: true, ...credentials,
  }));
  const cloudSale = {
    id: 'sale:flow-sale-fixture', targetType: '子牛', targetNumber: 'TEST5954', targetName: '精算結合確認用',
    birthday: '2026-01-01', calfId: 'calf-on-pc', cattleId: '', motherCowId: '',
    saleDate: '2026-10-27', salePrice: '500000', status: '販売済み',
    productionCostSnapshot: 200000, profitSnapshot: 300000,
    productionCostBreakdownSnapshot: {
      acquisition: 200000, feed: 0, medical: 0, breeding: 0, other: 0,
      farmCommon: 0, adjustment: 0, total: 200000, includedExpenseIds: [],
    },
    costSnapshotAt: '2026-10-20T00:00:00.000Z', createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z', cloudUpdatedAt: '2026-10-20T00:00:00.000Z',
  };
  const put = async (name: string, data: unknown) => {
    const destination = path.join(root, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, JSON.stringify(data), 'utf8');
  };
  const farmFile = (name: string) => `farms/${farmId}/${name}`;
  await put('users.json', users);
  await put('stripeSubscriptions.json', [{ id: 'unchanged-contract-fixture' }]);
  await put(farmFile('sales-sync.json'), [cloudSale]);
  await put(farmFile('expenses-sync.json'), []);
  await put(farmFile('settlement-sync.json'), []);
  await put(farmFile('cattle.json'), [{ id: 'unchanged-cow-fixture' }]);
  const preservedFiles = ['users.json', 'stripeSubscriptions.json', farmFile('sales-sync.json'), farmFile('expenses-sync.json'), farmFile('cattle.json')];
  const beforeServer = await Promise.all(preservedFiles.map(name => fs.readFile(path.join(root, name), 'utf8')));
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/sales', salesRouter);
  server = app.listen(0, '127.0.0.1') as Server;
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server failed to bind');
  const origin = `http://127.0.0.1:${address.port}`;
  const requests: Array<{ method: string; pathname: string; status: number }> = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(requested, origin);
    expect(url.origin).toBe(origin);
    expect(url.pathname.startsWith('/api/')).toBe(true);
    const response = await nativeFetch(url.href, init);
    requests.push({ method: init?.method || 'GET', pathname: url.pathname, status: response.status });
    return response;
  });
  const signInFixture = (user: FarmProUser) => {
    const { passwordHash: _hash, passwordSalt: _salt, ...data } = user;
    const authUser = { ...data, plan: user.plan || 'free' } as AuthUser;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('farmpro.authUser', JSON.stringify(authUser));
    window.localStorage.setItem('farmpro.authToken', createToken(authUser));
  };

  // Device one starts with its own IndexedDB and a recorded calf.
  vi.stubGlobal('indexedDB', new IDBFactory());
  signInFixture(users[0]);
  await saveRecordPreservingTimestamps('calves', {
    id: 'calf-on-pc', calfNumber: cloudSale.targetNumber, name: cloudSale.targetName, birthday: cloudSale.birthday,
  });
  const importedSale = (await getSalesList())[0];
  expect(importedSale.syncRecordId).toBe(cloudSale.id);
  const beforeLocalSale = await getRecordById<SaleRecord>('sales', importedSale.id);
  opened.push(await openFarmProDatabase());
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
  const page = render(<MemoryRouter initialEntries={[`/sales/${importedSale.id}/settlement`]}>
    <Routes><Route path="/sales/:id/settlement" element={<ManualSettlementReview />} /></Routes>
  </MemoryRouter>);
  await screen.findByText('保存前の照合が完了しました。明細を入力して確認してください。');
  for (const [label, value] of [
    ['精算番号', 'FLOW-20261027'], ['差引精算額（円）', '490000'],
    ['控除名', '市場手数料'], ['控除額（税込円）', '10000'],
    ['精算日', '2026-10-27'], ['支払先', 'Fixture Market'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const saveButton = screen.getByRole('button', { name: '内容を確認して正式保存' });
  await waitFor(() => expect(saveButton).toBeEnabled());
  fireEvent.click(saveButton);
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(requests.filter(row => row.method === 'POST')).toHaveLength(0);
  expect(JSON.parse(await fs.readFile(path.join(root, farmFile('settlement-sync.json')), 'utf8'))).toEqual([]);
  await waitFor(() => expect(saveButton).toBeEnabled());
  fireEvent.click(saveButton);
  await screen.findByText('販売精算は登録済みです。');
  await screen.findByText('登録済み精算');
  expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('差引支払額：490,000円'));
  expect(requests.filter(row => row.method === 'POST')).toEqual([
    { method: 'POST', pathname: '/api/expenses/settlement-sync', status: 201 },
  ]);
  expect((await checkCloudSettlementStatus(cloudSale.id)).registered).toBe(true);
  const registered = await getCloudSettlementDetails(cloudSale.id);
  expect(registered?.settlement).toMatchObject({ settlementNumber: 'FLOW-20261027', grossYen: 500000, expectedNetYen: 490000 });
  const firstExpenses = await getExpensesList({ requireCloudSync: true });
  expect(firstExpenses).toHaveLength(1);
  expect(firstExpenses[0]).toMatchObject({
    amount: '10000', animalId: 'calf-on-pc', settlementSaleId: cloudSale.id, settlementExpenseKind: 'created',
  });
  expect(await getAllRecords('expenses')).toEqual(firstExpenses);
  const firstSnapshot = await getOrCreateSaleCostSnapshot(importedSale);
  expect(firstSnapshot).toMatchObject({ productionCost: 200000, profit: 300000 });
  expect(settlementSellingFees(importedSale, firstExpenses)).toBe(10000);
  expect(settlementProfit(importedSale, firstExpenses, firstSnapshot || undefined)).toMatchObject({
    profit: 290000, sellingFees: 10000, additionalFees: 10000, requiresReview: false,
  });
  expect((await getAnimalExpenseTotals('calf', 'calf-on-pc', cloudSale.targetNumber)).nonFeedTotal).toBe(0);
  expect(await getRecordById<SaleRecord>('sales', importedSale.id)).toEqual(beforeLocalSale);
  page.unmount();
  const listing = render(<MemoryRouter><SalesList /></MemoryRouter>);
  await waitFor(() => expect(screen.getAllByText('290,000円').length).toBeGreaterThan(0));
  expect(screen.queryByText(/二重控除を防ぐため/)).not.toBeInTheDocument();
  listing.unmount();

  // A fresh module/IndexedDB instance represents a second browser, not a reset
  // of the first browser's records. The calf has a different local primary key.
  opened[0].close();
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  signInFixture(users[1]);
  const phoneRepository = await import('../storage/repository');
  const phoneSales = await import('./salesApi');
  const phoneExpenses = await import('./expensesApi');
  const phoneStatus = await import('./cloudSettlementStatus');
  const phoneCosts = await import('./saleCostSnapshot');
  const phoneProfit = await import('./settlementSellingFees');
  expect(await phoneRepository.getAllRecords('sales')).toEqual([]);
  expect(await phoneRepository.getAllRecords('expenses')).toEqual([]);
  await phoneRepository.saveRecordPreservingTimestamps('calves', {
    id: 'calf-on-phone', calfNumber: cloudSale.targetNumber, name: cloudSale.targetName, birthday: cloudSale.birthday,
  });
  const phoneSale = (await phoneSales.getSalesList())[0];
  expect(phoneSale.calfId).toBe('calf-on-phone');
  expect(phoneSale.syncRecordId).toBe(cloudSale.id);
  const phoneRecords = await phoneExpenses.getExpensesList({ requireCloudSync: true });
  expect(phoneRecords).toHaveLength(1);
  expect(phoneRecords[0].animalId).toBe('calf-on-pc');
  expect(await phoneStatus.getCloudSettlementDetails(cloudSale.id)).toEqual(registered);
  const phoneSnapshot = await phoneCosts.getOrCreateSaleCostSnapshot(phoneSale);
  expect(phoneProfit.settlementProfit(phoneSale, phoneRecords, phoneSnapshot || undefined)).toMatchObject({
    profit: 290000, sellingFees: 10000, additionalFees: 10000, requiresReview: false,
  });
  expect((await phoneExpenses.getAnimalExpenseTotals('calf', 'calf-on-phone', cloudSale.targetNumber)).nonFeedTotal).toBe(0);
  opened.push(await (await import('../storage/db')).openFarmProDatabase());
  expect(requests.filter(row => row.method === 'POST')).toHaveLength(1);
  expect(requests.filter(row => row.method !== 'GET' && row.method !== 'POST')).toEqual([]);
  expect(JSON.parse(await fs.readFile(path.join(root, farmFile('settlement-sync.json')), 'utf8'))).toHaveLength(1);
  expect(await Promise.all(preservedFiles.map(name => fs.readFile(path.join(root, name), 'utf8')))).toEqual(beforeServer);
}, 20000);
