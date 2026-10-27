import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { setImmediate as nextTurn } from 'node:timers/promises';
import express from 'express';
import { createPasswordHash, createToken, type AuthUser, type FarmProUser } from '../authStore';
import { requireAuth } from '../authMiddleware';
import { withFarmRequest } from '../farmRequestGate';
import expensesRouter from './expenses';
import salesRouter from './sales';

// Real authentication and HTTP handlers; all accounts/data are disposable fixtures.
// Outbound fetch is restricted to this local server and no app/startup jobs run.
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
const realFetch = globalThis.fetch;
const farm = 'farm-settlement-fixture';
const farmFile = (name: string) => `farms/${farm}/${name}`;
let previous: Record<string, string | undefined>;
let root: string;
let server: Server;
let origin: string;
let users: FarmProUser[];
let sale: ReturnType<typeof soldSale>;

function soldSale(adult = false) {
  return {
    id: adult ? 'sale:adult-fixture' : 'sale:calf-fixture',
    targetType: adult ? '成牛' : '子牛', targetNumber: adult ? 'TEST-CATTLE' : 'TEST5954',
    targetName: adult ? '成牛確認用' : '子牛確認用', birthday: adult ? '2020-01-01' : '2026-01-01',
    calfId: adult ? '' : 'calf-fixture', cattleId: adult ? 'cattle-fixture' : '',
    motherCowId: 'different-mother-fixture', saleDate: '2026-10-20', salePrice: '500000',
    status: '販売済み', productionCostSnapshot: 200000, profitSnapshot: 300000,
    costSnapshotAt: '2026-10-19T00:00:00.000Z',
    createdAt: '2026-10-19T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z',
  };
}

function existingExpense() {
  return {
    id: 'expense:existing-fixture', paymentDate: '2026-10-10', category: '医薬品費',
    description: '登録済みワクチン', vendor: 'Fixture Vet', amount: '5000', paymentMethod: '現金',
    target: sale.targetNumber, animalEarTag: sale.targetNumber, animalName: sale.targetName,
    animalType: sale.targetType === '成牛' ? 'cattle' : 'calf',
    animalId: sale.targetType === '成牛' ? sale.cattleId : sale.calfId,
    memo: '変更しない原記録', createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
  };
}

function payload() {
  const row = {
    id: 'settlement-fee-fixture', paymentDate: '2026-10-21', category: '手数料',
    description: '市場手数料', vendor: 'Fixture Market', amount: '10000',
    target: sale.targetNumber, animalEarTag: sale.targetNumber, animalName: sale.targetName,
    animalType: sale.targetType === '成牛' ? 'cattle' : 'calf',
    animalId: sale.targetType === '成牛' ? sale.cattleId : sale.calfId,
  };
  return {
    confirmed: true, grossYen: 500000, adjustmentYen: 0,
    expectedSale: {
      targetType: sale.targetType, targetNumber: sale.targetNumber, targetName: sale.targetName,
      birthday: sale.birthday, saleDate: sale.saleDate, calfId: sale.calfId, cattleId: sale.cattleId,
    },
    deductions: [{ label: '市場手数料', amountYen: 10000 } as { label: string; amountYen: number; expenseId?: string }],
    bundle: {
      settlement: {
        saleId: sale.id, settlementNumber: 'FIXTURE-20261021', expectedNetYen: 490000,
        expenseIds: [row.id], linkedExpenseIds: [] as string[], createdAt: '2026-10-21T00:00:00.000Z',
      },
      expenses: [row],
    },
  };
}

function safe(user: FarmProUser): AuthUser {
  const { passwordHash: _hash, passwordSalt: _salt, ...data } = user;
  return { ...data, plan: user.plan || 'free' };
}
async function put(name: string, data: unknown) {
  const destination = path.join(root, name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(data), 'utf8');
}
const raw = (name: string) => fs.readFile(path.join(root, name), 'utf8');
async function protectedSnapshot() {
  return Promise.all([
    'users.json', 'stripeSubscriptions.json', 'bank-transfer-applications.json',
    farmFile('sales-sync.json'), farmFile('expenses-sync.json'), farmFile('cattle.json'),
    'farms/farm-other-fixture/cattle.json',
  ].map(raw));
}
async function call(route: string, body?: unknown, userIndex = 0, method?: string) {
  return fetch(`${origin}/api${route}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      ...(userIndex < 0 ? {} : { Authorization: `Bearer ${createToken(safe(users[userIndex]))}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const post = (body: unknown = payload(), userIndex = 0) => call('/expenses/settlement-sync', body, userIndex);
const detailsPath = () => `/expenses/settlement-sync/${encodeURIComponent(sale.id)}/details`;
const statusPath = () => `/expenses/settlement-sync/${encodeURIComponent(sale.id)}`;
const ledger = async () => JSON.parse(await raw(farmFile('settlement-sync.json'))) as unknown[];

beforeEach(async () => {
  previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-http-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'settlement-http-fixture-secret';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('settlement-fixture-password');
  users = [
    { id: 'user-paid-fixture', farmId: farm, plan: 'standard' as const },
    { id: 'user-second-device-fixture', farmId: farm, plan: 'pro' as const },
    { id: 'user-other-fixture', farmId: 'farm-other-fixture', plan: 'pro' as const },
    { id: 'user-free-fixture', farmId: 'farm-free-fixture', plan: 'free' as const },
  ].map((user) => ({
    ...user, farmName: 'Fixture Farm', name: 'Fixture User', email: `${user.id}@example.invalid`,
    role: 'owner', active: true, ...credentials,
  }));
  sale = soldSale();
  await put('users.json', users);
  await put('stripeSubscriptions.json', [{ id: 'unchanged-stripe-fixture' }]);
  await put('bank-transfer-applications.json', [{ id: 'unchanged-bank-fixture' }]);
  await put(farmFile('sales-sync.json'), [sale]);
  await put(farmFile('expenses-sync.json'), [existingExpense()]);
  await put(farmFile('settlement-sync.json'), []);
  await put(farmFile('cattle.json'), [{ id: 'unchanged-cattle-fixture' }]);
  await put('farms/farm-other-fixture/cattle.json', [{ id: 'unchanged-other-cattle-fixture' }]);
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/sales', salesRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).origin, origin, 'tests must not contact an external service');
    return realFetch(input, init);
  };
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  assert(root.startsWith(path.join(os.tmpdir(), 'farmpro-settlement-http-')));
  await fs.rm(root, { recursive: true, force: true });
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

test('formal save requires a current authenticated paid account and explicit confirmation', async () => {
  const before = await protectedSnapshot();
  assert.equal((await post(payload(), -1)).status, 401);
  assert.equal((await post(payload(), 3)).status, 403);
  assert.equal((await post({ ...payload(), confirmed: false })).status, 400);
  users[0].active = false;
  await put('users.json', users);
  assert.equal((await post()).status, 401);
  users[0].active = true;
  await put('users.json', users);
  assert.deepEqual(await protectedSnapshot(), before);
  assert.deepEqual(await ledger(), []);
});

test('confirmed save publishes one fee, immutable calculation evidence, and the same result to another session', async () => {
  const before = await protectedSnapshot();
  const response = await post();
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { registered: true, saleId: sale.id });
  const details = await (await call(detailsPath())).json();
  assert.equal(details.settlement.grossYen, 500000);
  assert.equal(details.settlement.adjustmentYen, 0);
  assert.equal(details.settlement.expectedNetYen, 490000);
  assert.equal(details.settlement.deductions[0].amountYen, 10000);
  assert.equal(details.expenses.length, 1);
  assert.deepEqual(await (await call(detailsPath(), undefined, 1)).json(), details);
  const records = await (await call('/expenses/record-sync', undefined, 1)).json();
  assert.equal(records.length, 2);
  const fee = records.find((row: { id: string }) => row.id === 'settlement-fee-fixture');
  assert.equal(fee.amount, '10000');
  assert.equal(fee.animalId, sale.calfId);
  assert.equal(fee.settlementSaleId, sale.id);
  assert.equal(fee.settlementExpenseKind, 'created');
  assert.equal(500000 - sale.productionCostSnapshot - Number(fee.amount), 290000);
  assert.equal((await ledger()).length, 1);
  assert.deepEqual(await protectedSnapshot(), before);
});

test('another farm cannot read or finalize this sale even when the caller supplies a farm ID', async () => {
  assert.equal((await post()).status, 201);
  const before = await protectedSnapshot();
  assert.equal((await call(detailsPath(), undefined, 2)).status, 404);
  assert.equal((await (await call(statusPath(), undefined, 2)).json()).registered, false);
  assert.equal((await post({ ...payload(), farmId: farm }, 2)).status, 409);
  assert.deepEqual(await (await call('/expenses/record-sync', undefined, 2)).json(), []);
  assert.deepEqual(await protectedSnapshot(), before);
});

test('adult cattle uses cattleId and never the unrelated motherCowId', async () => {
  sale = soldSale(true);
  await put(farmFile('sales-sync.json'), [sale]);
  await put(farmFile('expenses-sync.json'), [existingExpense()]);
  assert.equal((await post()).status, 201);
  const details = await (await call(detailsPath())).json();
  assert.equal(details.expenses[0].animalType, 'cattle');
  assert.equal(details.expenses[0].animalId, sale.cattleId);
  assert.notEqual(details.expenses[0].animalId, sale.motherCowId);
  const before = await raw(farmFile('sales-sync.json'));
  const result = await call(`/sales/record-sync/${encodeURIComponent(sale.id)}`, { ...sale, cattleId: 'wrong-cattle' }, 0, 'PUT');
  assert(result.status >= 400);
  assert.equal(await raw(farmFile('sales-sync.json')), before);
});

test('mixed deductions link a canonical existing expense once and preserve the original expense bytes', async () => {
  const body = payload();
  body.deductions.push({ label: '登録済みワクチン', amountYen: 5000, expenseId: 'expense:existing-fixture' });
  body.bundle.settlement.linkedExpenseIds = ['expense:existing-fixture'];
  body.bundle.settlement.expectedNetYen = 485000;
  const before = await protectedSnapshot();
  assert.equal((await post(body)).status, 201);
  const details = await (await call(detailsPath())).json();
  assert.equal(details.expenses.length, 1);
  assert.equal(details.linkedExpenseSnapshots.length, 1);
  assert.equal(details.linkedExpenseSnapshots[0].id, 'expense:existing-fixture');
  const records = await (await call('/expenses/record-sync')).json();
  assert.equal(records.length, 2);
  assert.equal(records.find((row: { id: string }) => row.id === 'expense:existing-fixture').settlementExpenseKind, 'linked');
  assert.deepEqual(await protectedSnapshot(), before);
});

test('existing-only settlement still verifies the confirmed sale identity without creating duplicate expenses', async () => {
  const body = payload();
  body.deductions = [{ label: '登録済みワクチン', amountYen: 5000, expenseId: 'expense:existing-fixture' }];
  body.bundle.expenses = [];
  body.bundle.settlement.expenseIds = [];
  body.bundle.settlement.linkedExpenseIds = ['expense:existing-fixture'];
  body.bundle.settlement.expectedNetYen = 495000;
  assert.equal((await post({ ...body, expectedSale: { ...body.expectedSale, targetNumber: 'WRONG' } })).status, 409);
  assert.deepEqual(await ledger(), []);
  assert.equal((await post(body)).status, 201);
  assert.equal((await (await call('/expenses/record-sync')).json()).length, 1);
  assert.equal((await (await call(detailsPath())).json()).expenses.length, 0);
});

test('wrong prices, arithmetic, animal identity and non-sold records cannot write a settlement', async () => {
  const before = await protectedSnapshot();
  const badPrice = payload(); badPrice.grossYen = 499999;
  const badNet = payload(); badNet.bundle.settlement.expectedNetYen = 489999;
  const badAnimal = payload(); badAnimal.bundle.expenses[0].animalId = 'different-calf';
  const negative = payload(); negative.deductions[0].amountYen = -1;
  for (const body of [badPrice, badNet, badAnimal, negative, { ...payload(), expectedSale: undefined }]) {
    assert((await post(body)).status >= 400);
    assert.deepEqual(await ledger(), []);
  }
  for (const status of ['出荷予定', '出荷済み', '取消']) {
    await put(farmFile('sales-sync.json'), [{ ...sale, status }]);
    assert.equal((await post()).status, 409);
  }
  await put(farmFile('sales-sync.json'), [{ ...sale, deletedAt: '2026-10-22T00:00:00Z' }]);
  assert.equal((await post()).status, 409);
  await put(farmFile('sales-sync.json'), [sale]);
  assert.deepEqual(await protectedSnapshot(), before);
  assert.deepEqual(await ledger(), []);
});

test('a linked amount or contradictory animal identity and a reused new expense ID are rejected', async () => {
  const body = payload();
  body.deductions.push({ label: '登録済みワクチン', amountYen: 5000, expenseId: 'expense:existing-fixture' });
  body.bundle.settlement.linkedExpenseIds = ['expense:existing-fixture'];
  body.bundle.settlement.expectedNetYen = 485000;
  for (const change of [{ amount: '5001' }, { animalId: 'other-animal' }, { animalType: 'cattle' }, { deletedAt: '2026-10-22T00:00:00Z' }]) {
    await put(farmFile('expenses-sync.json'), [{ ...existingExpense(), ...change }]);
    assert.equal((await post(body)).status, 409);
    assert.deepEqual(await ledger(), []);
  }
  await put(farmFile('expenses-sync.json'), [existingExpense()]);
  const collision = payload();
  collision.bundle.expenses[0].id = 'expense:existing-fixture';
  collision.bundle.settlement.expenseIds = ['expense:existing-fixture'];
  assert.equal((await post(collision)).status, 409);
  assert.deepEqual(await ledger(), []);
});

test('missing calf or adult linkage is rejected even when the submitted snapshot matches', async () => {
  for (const adult of [false, true]) {
    sale = { ...soldSale(adult), calfId: '', cattleId: '' };
    await put(farmFile('sales-sync.json'), [sale]);
    const response = await post();
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /個体を照合できません/);
    assert.equal((await (await call(statusPath())).json()).saleReady, false);
    assert.deepEqual(await ledger(), []);
  }
});

test('legacy local expense aliases resolve uniquely and cannot duplicate a canonical reference', async () => {
  const body = payload();
  body.bundle.expenses = [];
  body.bundle.settlement.expenseIds = [];
  body.deductions = [
    { label: '登録済みワクチン', amountYen: 5000, expenseId: 'existing-fixture' },
    { label: '登録済みワクチン', amountYen: 5000, expenseId: 'expense:existing-fixture' },
  ];
  body.bundle.settlement.linkedExpenseIds = ['existing-fixture', 'expense:existing-fixture'];
  body.bundle.settlement.expectedNetYen = 490000;
  assert.equal((await post(body)).status, 409);
  assert.deepEqual(await ledger(), []);
  body.deductions = body.deductions.slice(0, 1);
  body.bundle.settlement.linkedExpenseIds = ['existing-fixture'];
  body.bundle.settlement.expectedNetYen = 495000;
  assert.equal((await post(body)).status, 201);
  const result = await (await call(detailsPath())).json();
  assert.deepEqual(result.settlement.linkedExpenseIds, ['expense:existing-fixture']);
  assert.equal(result.settlement.deductions[0].expenseId, 'expense:existing-fixture');
});

test('simultaneous submissions create exactly one settlement and one new expense', async () => {
  const before = await protectedSnapshot();
  const statuses = await Promise.all([post(), post(), post()].map(async response => (await response).status));
  assert.deepEqual(statuses.sort(), [201, 409, 409]);
  assert.equal((await ledger()).length, 1);
  assert.equal((await (await call('/expenses/record-sync')).json()).length, 2);
  assert.deepEqual(await protectedSnapshot(), before);
});

test('finalized sale and both newly created and linked expenses reject incompatible edits and deletion', async () => {
  const body = payload();
  body.deductions.push({ label: '登録済みワクチン', amountYen: 5000, expenseId: 'expense:existing-fixture' });
  body.bundle.settlement.linkedExpenseIds = ['expense:existing-fixture'];
  body.bundle.settlement.expectedNetYen = 485000;
  assert.equal((await post(body)).status, 201);
  const before = await protectedSnapshot();
  for (const id of ['settlement-fee-fixture', 'expense:existing-fixture']) {
    const route = `/expenses/record-sync/${encodeURIComponent(id)}`;
    assert((await call(route, { id, amount: '1' }, 0, 'PUT')).status >= 400);
    assert((await call(route, undefined, 0, 'DELETE')).status >= 400);
  }
  const saleRoute = `/sales/record-sync/${encodeURIComponent(sale.id)}`;
  assert((await call(saleRoute, { ...sale, salePrice: '1' }, 0, 'PUT')).status >= 400);
  assert((await call(saleRoute, undefined, 0, 'DELETE')).status >= 400);
  assert.deepEqual(await protectedSnapshot(), before);
});

test('failed atomic publication leaves no partial fee and response loss is resolved by status read', async (t) => {
  const before = await protectedSnapshot();
  const realRename = fs.rename.bind(fs);
  let failure = t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    if (String(args[1]).endsWith('/settlement-sync.json')) throw new Error('fixture-before-publication');
    return realRename(...args);
  });
  assert.equal((await post()).status, 503);
  failure.mock.restore();
  assert.deepEqual(await ledger(), []);
  assert.equal((await (await call('/expenses/record-sync')).json()).length, 1);
  assert.deepEqual(await protectedSnapshot(), before);
  failure = t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    await realRename(...args);
    if (String(args[1]).endsWith('/settlement-sync.json')) throw new Error('fixture-after-publication');
  });
  assert.equal((await post()).status, 503);
  failure.mock.restore();
  assert.equal((await (await call(statusPath())).json()).registered, true);
  assert.equal((await call(detailsPath())).status, 200);
  assert.equal((await post()).status, 409);
  assert.equal((await ledger()).length, 1);
  assert.equal((await (await call('/expenses/record-sync')).json()).length, 2);
  assert.deepEqual(await protectedSnapshot(), before);
});

test('disconnect while publication is pending keeps the farm locked until the outcome is durable', async (t) => {
  let release!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const realRename = fs.rename.bind(fs);
  const rename = t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    if (String(args[1]).endsWith('/settlement-sync.json')) { entered(); await pending; }
    return realRename(...args);
  });
  const controller = new AbortController();
  const request = fetch(`${origin}/api/expenses/settlement-sync`, {
    method: 'POST', signal: controller.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${createToken(safe(users[0]))}` },
    body: JSON.stringify(payload()),
  });
  await started;
  controller.abort();
  await assert.rejects(request);
  let nextEntered = false;
  const queued = withFarmRequest(farm, async () => { nextEntered = true; });
  try {
    await nextTurn();
    await nextTurn();
    assert.equal(nextEntered, false);
  } finally {
    release();
    await queued;
    rename.mock.restore();
  }
  assert.equal((await (await call(statusPath(), undefined, 1)).json()).registered, true);
  assert.equal((await post()).status, 409);
  assert.equal((await ledger()).length, 1);
});

test('corrupt settlement storage fails closed without replacing existing data', async () => {
  const before = await protectedSnapshot();
  await fs.writeFile(path.join(root, farmFile('settlement-sync.json')), '{broken', 'utf8');
  assert.equal((await post()).status, 503);
  assert.equal((await call(statusPath())).status, 503);
  assert.equal(await raw(farmFile('settlement-sync.json')), '{broken');
  assert.deepEqual(await protectedSnapshot(), before);
});
