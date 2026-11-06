import 'fake-indexeddb/auto';
import { createElement as h } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Treatment, TreatmentInput } from '../types/treatment';
import { TreatmentForm } from '../pages/TreatmentForm';
import { TreatmentList } from '../pages/TreatmentList';
import { batchKey, getSupplyBatches, type SupplyMovement } from './supplyInventoryApi';
import { getSupplySyncIdentity, SUPPLY_SYNC_STATE_ID, type SupplyInventorySyncState } from './supplyInventorySyncState';
import { hasPendingSupplyLinkedRecord, retrySupplyLinkedRecords } from './supplyInventoryLinkedSync';
import { toCloudTreatment, type CloudTreatmentRecord } from './treatmentSyncProtocol';
import type { ExpenseRecord } from './expensesApi';

const bridge = vi.hoisted(() => ({ sync: vi.fn<() => Promise<boolean>>() }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'standard' }));
vi.mock('./authClient', () => ({
  getStoredAuthUser: () => ({ id: 'treatment-stock-fixture-user', farmId: 'treatment-stock-fixture-farm', plan: 'standard' }),
  getAuthToken: () => 'treatment-stock-fixture-token',
}));
// Only the stock server acknowledgement is controlled. The actual form/list,
// treatment service, stock transaction, source outbox, expense service and IDB run.
vi.mock('./supplyInventorySync', () => ({
  syncSupplyInventorySafely: bridge.sync,
  getSupplyInventorySyncStatus: () => ({ state: 'idle', message: '' }),
}));

const firstTime = '2026-11-01T00:00:00.000Z';
const nextTime = '2026-11-02T00:00:00.000Z';
const localId = 4101;
const cloudId = `treatment:${localId}`;
const sourcePath = `/api/treatments/record-sync/${encodeURIComponent(cloudId)}`;
const queueId = `supply-linked-sync:treatments:${encodeURIComponent(cloudId)}`;
const purchase: SupplyMovement = {
  id: 'treatment-stock-fixture-purchase', kind: '医薬品', action: '購入', date: '2026-10-28',
  itemName: '在庫競合検証薬', lotNumber: 'MED-CONFLICT', quantity: 10, unit: 'mL',
  expiryDate: '', supplier: '検証仕入先', storageLocation: '検証保管庫', donorCow: '',
  sire: '', grade: '', cowEarTag: '', unitPrice: 100, amount: 1000,
  paymentMethod: '現金', note: '隔離fixture', expenseRecorded: false,
  createdAt: firstTime, updatedAt: firstTime,
};
const usage: SupplyMovement = {
  ...purchase, id: `treatment-stock-${localId}`, action: '使用', date: '2026-11-02',
  cowEarTag: 'MED-FIXTURE-COW', quantity: 2, unitPrice: 0, amount: 0,
};
const input: TreatmentInput = {
  recordType: '治療', targetNumber: 'MED-FIXTURE-COW', targetName: '医薬品在庫検証牛',
  symptom: '検証用の症状', diagnosis: '', treatmentProcedure: '', treatmentDate: '2026-11-02',
  medicine: purchase.itemName, medicineSource: 'farm_stock', dosage: '2', medicineCost: '0', medicalFee: '3400',
  medicineInventoryBatchKey: batchKey(purchase), medicineInventoryQuantity: 2,
  withdrawalEndDate: '', veterinarian: '検証獣医師', progress: '経過観察', note: '確認済みの治療原本',
};
const original: Treatment & StoredRecord = {
  ...input, id: localId, syncRecordId: cloudId, medicineInventoryMovementId: usage.id,
  cloudSyncPending: false, cloudUpdatedAt: firstTime, createdAt: firstTime, updatedAt: firstTime,
  localBusinessReference: { reference: '保護する既存業務情報', amount: '990' },
};
const expense: ExpenseRecord & { cloudUpdatedAt: string } = {
  id: 'treatment-stock-fixture-medical', syncRecordId: 'expense:treatment-stock-fixture-medical',
  cloudSyncPending: false, cloudUpdatedAt: firstTime,
  paymentDate: input.treatmentDate, category: '診療費', description: '診療費', vendor: input.veterinarian,
  amount: '3400', paymentMethod: '', target: `${input.targetNumber} ${input.targetName}`,
  sourceType: 'treatment', sourceId: String(localId), memo: '確認済みの診療経費',
  createdAt: firstTime, updatedAt: firstTime,
};
type Queued = StoredRecord & { store: string; record: StoredRecord; movementIds: string[] };
type RequestRecord = {
  path: string; method: string; ifMatch?: string | null; sourcePending?: unknown; sourceQueued?: boolean;
};
let remote: CloudTreatmentRecord;
let remoteExists = true;
let additionalSources: Map<string, CloudTreatmentRecord>;
let remoteExpense: StoredRecord;
let remoteExpenses: Map<string, StoredRecord>;
let loseSourceAcknowledgement = false;
let requests: RequestRecord[];
const readSource = () => getRecordById<Treatment & StoredRecord>('treatments', localId);
const readQueue = () => getRecordById<Queued>('metadata', queueId);
const expenseBytes = async () => JSON.stringify(await getAllRecords('expenses'));
const inventoryBytes = async () => JSON.stringify(await getAllRecords('supplyInventory'));
// A failed operation and its persisted sync-status warning can coexist.
const operationError = () => screen.queryAllByRole('alert').find(alert => alert.classList.contains('MuiAlert-standardError'));
const sourceRevision = (record?: CloudTreatmentRecord) => new Date(Math.max(Date.now(), record
  ? Date.parse(String(record.cloudUpdatedAt)) + 1 : 0)).toISOString();

async function showForm() {
  const view = render(h(MemoryRouter, { initialEntries: [`/treatments/${localId}/edit?returnTo=/finished`] },
    h(Routes, null,
      h(Route, { path: '/treatments/:id/edit', element: h(TreatmentForm, { mode: 'edit' }) }),
      h(Route, { path: '/finished', element: h('div', null, '治療保存が完了した') }),
    )));
  await screen.findByLabelText('診療費（円）');
  await waitFor(() => expect(bridge.sync).toHaveBeenCalled());
  bridge.sync.mockClear();
  requests = [];
  return view;
}
async function showList() {
  const view = render(h(MemoryRouter, { initialEntries: ['/treatments'] }, h(TreatmentList)));
  await screen.findByText('表示：1件 / 全1件');
  bridge.sync.mockClear();
  requests = [];
  return view;
}
async function enterMedicalFee(value: string) {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('診療費（円）'));
  await user.type(screen.getByLabelText('診療費（円）'), value);
  return user;
}
async function waitForFormResult() {
  await waitFor(() => expect(Boolean(operationError() || screen.queryByText('治療保存が完了した'))).toBe(true));
}
async function waitForListResult() {
  await waitFor(async () => {
    if (operationError()) return;
    expect(screen.queryByText('表示：0件 / 全0件')).not.toBeNull();
    expect(await getAllRecords('expenses')).toEqual([]);
  });
}
async function expectUsageOnce() {
  const inventory = await getAllRecords<SupplyMovement>('supplyInventory');
  expect(inventory.filter(row => row.action === '使用')).toHaveLength(1);
  expect(inventory.find(row => row.id === usage.id)?.quantity).toBe(2);
  expect(getSupplyBatches(inventory, '医薬品')[0].balance).toBe(8);
}

beforeEach(async () => {
  window.history.replaceState(null, '', '/treatments');
  localStorage.clear(); sessionStorage.clear();
  for (const store of ['treatments', 'expenses', 'supplyInventory', 'metadata', 'masters'] as const) await clearStore(store);
  await saveRecordPreservingTimestamps('masters', { id: 801, category: 'medicine', name: purchase.itemName,
    active: true, code: 'FIXTURE-MED', note: '', autoCalculateWithdrawal: false, createdAt: firstTime, updatedAt: firstTime });
  await saveRecordPreservingTimestamps('supplyInventory', purchase);
  await saveRecordPreservingTimestamps('supplyInventory', usage);
  await saveRecordPreservingTimestamps('treatments', original);
  await saveRecordPreservingTimestamps('expenses', expense);
  await saveRecordPreservingTimestamps<SupplyInventorySyncState>('metadata', {
    id: SUPPLY_SYNC_STATE_ID, version: 1, ...getSupplySyncIdentity()!,
    epoch: 'treatment-stock-fixture-epoch', revision: 35, baseline: [purchase, usage], pending: [],
  });
  bridge.sync.mockImplementation(async () => {
    const state = (await getRecordById<SupplyInventorySyncState>('metadata', SUPPLY_SYNC_STATE_ID))!;
    await saveRecordPreservingTimestamps<SupplyInventorySyncState>('metadata', {
      ...state, revision: (state.revision ?? 35) + 1,
      baseline: await getAllRecords<SupplyMovement>('supplyInventory'), pending: [],
    });
    return retrySupplyLinkedRecords();
  });
  remote = { ...toCloudTreatment(original), cloudUpdatedAt: firstTime };
  remoteExists = true;
  additionalSources = new Map();
  remoteExpense = { ...expense, id: expense.syncRecordId! };
  remoteExpenses = new Map([[expense.syncRecordId!, remoteExpense]]);
  loseSourceAcknowledgement = false;
  requests = [];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const request: RequestRecord = { path: String(url), method: init?.method ?? 'GET' };
    requests.push(request);
    if (request.path === '/api/treatments/record-sync' && request.method === 'GET') {
      return Response.json([...(remoteExists ? [remote] : []), ...additionalSources.values()]);
    }
    if (request.path.startsWith('/api/treatments/record-sync/')) {
      const id = decodeURIComponent(request.path.slice('/api/treatments/record-sync/'.length));
      const current = id === cloudId ? remoteExists ? remote : undefined : additionalSources.get(id);
      if (request.method === 'GET') return current ? Response.json(current) : new Response(null, { status: 404 });
      if (!['PUT', 'DELETE'].includes(request.method)) throw new Error(`Unexpected source method: ${request.method}`);
      request.ifMatch = new Headers(init?.headers).get('If-Match');
      const matches = current ? request.ifMatch === JSON.stringify(current.cloudUpdatedAt)
        : new Headers(init?.headers).get('If-None-Match') === '*';
      if (!matches) {
        return Response.json({ message: 'Fixture source revision changed' }, { status: 412 });
      }
      let next: CloudTreatmentRecord;
      if (request.method === 'PUT') {
        if (current?.deletedAt) return Response.json({ message: 'Fixture source deleted' }, { status: 409 });
        next = { ...JSON.parse(String(init?.body)), cloudUpdatedAt: sourceRevision(current) };
      } else if (current?.deletedAt) {
        next = current;
      } else {
        const revision = sourceRevision(current);
        next = { ...current, id, deletedAt: revision, cloudUpdatedAt: revision };
      }
      if (id === cloudId) { remote = next; remoteExists = true; }
      else additionalSources.set(id, next);
      if (loseSourceAcknowledgement) {
        loseSourceAcknowledgement = false;
        throw new TypeError('Fixture: treatment committed, acknowledgement lost');
      }
      return Response.json(next);
    }
    if (request.path === '/api/expenses/record-sync' && request.method === 'GET') return Response.json([...remoteExpenses.values()]);
    if (request.path.startsWith('/api/expenses/record-sync/') && request.method === 'PUT') {
      const body = JSON.parse(String(init?.body));
      const source = await getRecordById<Treatment & StoredRecord>('treatments', Number(body.sourceId));
      request.sourcePending = source?.cloudSyncPending;
      request.sourceQueued = await hasPendingSupplyLinkedRecord('treatments', source?.syncRecordId || `treatment:${body.sourceId}`);
      remoteExpense = { ...body, id: decodeURIComponent(request.path.slice('/api/expenses/record-sync/'.length)), cloudUpdatedAt: nextTime };
      remoteExpenses.set(String(remoteExpense.id), remoteExpense);
      return Response.json(remoteExpense);
    }
    if (request.path.startsWith('/api/expenses/record-sync/') && request.method === 'DELETE') {
      const id = decodeURIComponent(request.path.slice('/api/expenses/record-sync/'.length));
      remoteExpense = { ...remoteExpenses.get(id), id, deletedAt: nextTime, cloudUpdatedAt: nextTime };
      remoteExpenses.set(id, remoteExpense);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${request.path}`);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('keeps a stock-treatment edit and queue without changing its expense when a peer changed the remote source', async () => {
  await showForm();
  remote = { ...remote, medicalFee: '9100', note: '別端末の確定した治療', updatedAt: nextTime, cloudUpdatedAt: nextTime };
  const cloudBefore = JSON.stringify(remote);
  const expenseBefore = await expenseBytes();
  const remoteExpenseBefore = JSON.stringify(remoteExpense);
  const user = await enterMedicalFee('4500');

  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitForFormResult();

  expect.soft(operationError()).toBeDefined();
  expect.soft(screen.queryByText('治療保存が完了した')).toBeNull();
  expect.soft(await readSource()).toMatchObject({ medicalFee: '4500', medicineCost: '0', cloudSyncPending: true,
    medicineInventoryMovementId: usage.id, localBusinessReference: original.localBusinessReference });
  expect.soft(await readQueue()).toMatchObject({ store: 'treatments', record: { medicalFee: '4500' }, movementIds: [usage.id] });
  await expectUsageOnce();
  expect.soft(await expenseBytes()).toBe(expenseBefore);
  expect.soft(JSON.stringify(remoteExpense)).toBe(remoteExpenseBefore);
  expect.soft(JSON.stringify(remote)).toBe(cloudBefore);
  expect.soft(requests).toContainEqual({ path: sourcePath, method: 'GET' });
  expect(requests.filter(request => request.method !== 'GET')).toEqual([]);
});

it('rejects deletion from the actual list before removing stock usage or expense when a peer changed the treatment', async () => {
  await showList();
  remote = { ...remote, medicalFee: '9100', note: '別端末の削除しない治療', updatedAt: nextTime, cloudUpdatedAt: nextTime };
  const cloudBefore = JSON.stringify(remote);
  const expenseBefore = await expenseBytes();
  const remoteExpenseBefore = JSON.stringify(remoteExpense);
  const stockBefore = await inventoryBytes();
  const user = userEvent.setup();

  await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
  await waitForListResult();

  expect.soft(operationError()).toBeDefined();
  expect.soft(await readSource()).toMatchObject({ id: localId, medicalFee: '3400', medicineCost: '0',
    medicineInventoryMovementId: usage.id, localBusinessReference: original.localBusinessReference });
  expect.soft(await expenseBytes()).toBe(expenseBefore);
  expect.soft(JSON.stringify(remoteExpense)).toBe(remoteExpenseBefore);
  expect.soft(await inventoryBytes()).toBe(stockBefore);
  expect.soft(JSON.stringify(remote)).toBe(cloudBefore);
  expect.soft(requests).toContainEqual({ path: sourcePath, method: 'GET' });
  expect.soft(requests.filter(request => request.method !== 'GET')).toEqual([]);
  expect(bridge.sync).not.toHaveBeenCalled();
});

it('keeps the medical fee after a lost stock-treatment PUT acknowledgement, then confirms the source before one expense update', async () => {
  await showForm();
  const expenseBefore = await expenseBytes();
  const remoteExpenseBefore = JSON.stringify(remoteExpense);
  const user = await enterMedicalFee('4500');
  loseSourceAcknowledgement = true;

  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitForFormResult();

  expect.soft(operationError()).toBeDefined();
  expect.soft(await readSource()).toMatchObject({ medicalFee: '4500', cloudSyncPending: true });
  expect.soft(await readQueue()).toBeDefined();
  expect.soft(await expenseBytes()).toBe(expenseBefore);
  expect.soft(JSON.stringify(remoteExpense)).toBe(remoteExpenseBefore);
  expect.soft(requests.filter(request => request.path.startsWith('/api/expenses/'))).toEqual([]);
  await expectUsageOnce();
  if (!screen.queryByRole('button', { name: '保存' })) return;

  await user.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('治療保存が完了した');

  expect(await readSource()).toMatchObject({ medicalFee: '4500', medicineCost: '0', cloudSyncPending: false,
    medicineInventoryMovementId: usage.id, localBusinessReference: original.localBusinessReference });
  expect(await readQueue()).toBeUndefined();
  expect(await getAllRecords('expenses')).toMatchObject([{ id: expense.id, amount: '4500' }]);
  const fees = requests.filter(request => request.path.startsWith('/api/expenses/') && request.method === 'PUT');
  expect(fees).toHaveLength(1);
  expect(fees[0]).toMatchObject({ sourcePending: false, sourceQueued: false });
  await expectUsageOnce();
});

it('holds the medical fee and stock across a lost DELETE acknowledgement and list reload, then cleans up once on explicit retry', async () => {
  const view = await showList();
  const expenseBefore = await expenseBytes();
  const remoteExpenseBefore = JSON.stringify(remoteExpense);
  const stockBefore = await inventoryBytes();
  const user = userEvent.setup();
  loseSourceAcknowledgement = true;

  await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
  await waitForListResult();
  await screen.findByText('削除の完了を確認できていません。内容を確認し、もう一度削除してください。');

  expect.soft(operationError()).toBeDefined();
  expect.soft(remote.deletedAt).toBeDefined();
  expect.soft(await readSource()).toMatchObject({ id: localId, medicalFee: '3400', medicineInventoryMovementId: usage.id,
    cloudSyncPending: true, treatmentSyncDeletePending: true });
  expect.soft(await expenseBytes()).toBe(expenseBefore);
  expect.soft(JSON.stringify(remoteExpense)).toBe(remoteExpenseBefore);
  expect.soft(await inventoryBytes()).toBe(stockBefore);
  expect.soft(requests.filter(request => request.path.startsWith('/api/expenses/') && request.method !== 'GET')).toEqual([]);
  expect.soft(bridge.sync).not.toHaveBeenCalled();
  const acceptedDeletion = JSON.stringify(remote);
  if (!await readSource()) return;

  view.unmount();
  await showList();
  expect(await readSource()).toMatchObject({ cloudSyncPending: true, treatmentSyncDeletePending: true });
  await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
  await screen.findByText('表示：0件 / 全0件');
  await waitFor(async () => expect(await getAllRecords('expenses')).toEqual([]));

  expect(await readSource()).toBeUndefined();
  expect(await readQueue()).toBeUndefined();
  expect(await getAllRecords('supplyInventory')).toEqual([purchase]);
  expect(JSON.stringify(remote)).toBe(acceptedDeletion);
  expect(remoteExpense.deletedAt).toBeDefined();
  expect(bridge.sync).toHaveBeenCalledTimes(1);
  expect(requests.filter(request => request.path.startsWith('/api/expenses/') && request.method === 'DELETE')).toHaveLength(1);
  expect(requests.filter(request => request.method === 'PUT')).toEqual([]);
});

it('retries a new farm-stock treatment in the same form without creating a second source, stock usage or medical fee after ACK loss', async () => {
  await clearStore('treatments');
  await clearStore('expenses');
  await clearStore('supplyInventory');
  await saveRecordPreservingTimestamps('supplyInventory', purchase);
  const state = (await getRecordById<SupplyInventorySyncState>('metadata', SUPPLY_SYNC_STATE_ID))!;
  await saveRecordPreservingTimestamps<SupplyInventorySyncState>('metadata', { ...state, baseline: [purchase], pending: [] });
  remoteExists = false;
  remoteExpenses.clear();
  const query = new URLSearchParams({ targetNumber: input.targetNumber, targetName: input.targetName, returnTo: '/finished' });
  render(h(MemoryRouter, { initialEntries: [`/treatments/new?${query}`] },
    h(Routes, null,
      h(Route, { path: '/treatments/new', element: h(TreatmentForm, { mode: 'create' }) }),
      h(Route, { path: '/finished', element: h('div', null, '治療保存が完了した') }),
    )));
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/症状/), input.symptom);
  await user.type(screen.getByLabelText(/治療日/), input.treatmentDate);
  await user.type(screen.getByLabelText('使用薬剤／ワクチン'), purchase.itemName);
  await user.click(await screen.findByRole('option', { name: /在庫競合検証薬/ }));
  await user.click(screen.getByRole('combobox', { name: '薬剤の使用元' }));
  await user.click(screen.getByRole('option', { name: '農場在庫から使用' }));
  await user.click(screen.getByRole('combobox', { name: '使用する在庫・ロット' }));
  await user.click(await screen.findByRole('option', { name: /MED-CONFLICT/ }));
  await user.type(screen.getByLabelText('在庫からの使用数量'), '2');
  await user.type(screen.getByLabelText('診療費（円）'), '4500');
  bridge.sync.mockClear();
  requests = [];
  loseSourceAcknowledgement = true;

  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitForFormResult();

  expect.soft(operationError()).toBeDefined();
  expect.soft(screen.queryByText('治療保存が完了した')).toBeNull();
  const firstRows = await getAllRecords<Treatment & StoredRecord>('treatments');
  expect(firstRows).toHaveLength(1);
  const first = firstRows[0];
  expect.soft(first).toMatchObject({ medicalFee: '4500', medicineSource: 'farm_stock', cloudSyncPending: true });
  expect.soft(additionalSources.size).toBe(1);
  expect.soft(await getAllRecords('expenses')).toEqual([]);
  expect.soft(remoteExpenses.size).toBe(0);
  expect.soft(requests.filter(request => request.path.startsWith('/api/expenses/'))).toEqual([]);
  if (!screen.queryByRole('button', { name: '保存' })) return;

  await user.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('治療保存が完了した');

  const sources = await getAllRecords<Treatment & StoredRecord>('treatments');
  expect.soft(sources).toHaveLength(1);
  expect.soft(sources[0]).toMatchObject({ id: first.id, medicalFee: '4500', cloudSyncPending: false });
  expect.soft(additionalSources.size).toBe(1);
  expect.soft([...additionalSources.keys()]).toEqual([first.syncRecordId]);
  const inventory = await getAllRecords<SupplyMovement>('supplyInventory');
  expect.soft(inventory.filter(row => row.action === '使用')).toHaveLength(1);
  expect.soft(inventory.find(row => row.action === '使用')).toMatchObject({ id: first.medicineInventoryMovementId, quantity: 2 });
  expect.soft(getSupplyBatches(inventory, '医薬品')[0].balance).toBe(8);
  expect.soft(await getAllRecords('expenses')).toMatchObject([{ amount: '4500', sourceType: 'treatment', sourceId: String(first.id) }]);
  expect.soft(remoteExpenses.size).toBe(1);
  const fees = requests.filter(request => request.path.startsWith('/api/expenses/') && request.method === 'PUT');
  expect.soft(fees).toHaveLength(1);
  expect.soft(fees[0]).toMatchObject({ sourcePending: false, sourceQueued: false });
  expect(await hasPendingSupplyLinkedRecord('treatments', first.syncRecordId!)).toBe(false);
}, 15000);
