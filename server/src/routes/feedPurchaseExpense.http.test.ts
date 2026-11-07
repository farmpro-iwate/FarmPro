import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { createPasswordHash, createToken, type AuthUser, type FarmProUser } from '../authStore';
import { requireAuth } from '../authMiddleware';
import expensesRouter from './expenses';

// Only disposable fixture farms and a loopback HTTP server are used.
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
const realFetch = globalThis.fetch;
const farm = 'farm-feed-purchase-fixture';
const otherFarm = 'farm-feed-purchase-other';
const farmFile = (name: string, farmId = farm) => 'farms/' + farmId + '/' + name;
const firstId = 'expense:manual-first';
const secondId = 'expense:manual-second';
const sourceId = 'feed-inventory:purchase-fixture';
const conditional = { 'If-None-Match': '*' };
let previous: Record<string, string | undefined>;
let root: string;
let server: Server;
let origin: string;
let users: FarmProUser[];

function manualExpense(id = firstId) {
  return {
    id, paymentDate: '2026-11-01', category: '飼料費', expenseCategoryMasterId: 4,
    description: '確認済みの飼料購入', vendor: 'Fixture Feed Supplier', vendorMasterId: 7,
    amount: '012500', paymentMethod: '銀行振込', target: '確認用農場',
    animalType: 'cattle', animalId: 'fixture-cattle', animalEarTag: 'FIXTURE-0001', animalName: '確認用牛',
    sourceType: 'manual', memo: '支払日・金額・メモを変更しない',
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T01:00:00.000Z',
    cloudUpdatedAt: '2026-11-01T02:00:00.000Z',
    unknownBusinessExtension: { keep: 'untouched' },
  };
}

function feedExpense(id: string, purchaseId = sourceId) {
  return {
    ...manualExpense(id), paymentDate: '2026-11-02', amount: '9000',
    sourceType: 'feed-purchase', sourceId: purchaseId, sourceDetail: 'purchase',
  };
}

function safe(user: FarmProUser): AuthUser {
  const { passwordHash: _hash, passwordSalt: _salt, ...record } = user;
  return { ...record, plan: user.plan || 'free' };
}

async function put(name: string, value: unknown) {
  const file = path.join(root, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value), 'utf8');
}
const raw = (name: string) => fs.readFile(path.join(root, name), 'utf8');
const expenses = async () => JSON.parse(await raw(farmFile('expenses-sync.json'))) as Array<Record<string, unknown>>;
const recordPath = (id: string) => '/expenses/record-sync/' + encodeURIComponent(id);
const linkPath = (id: string) => recordPath(id) + '/feed-purchase-link';

async function call(route: string, body?: unknown, userIndex = 0, method?: string, headers: Record<string, string> = {}) {
  return fetch(origin + '/api' + route, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      ...(userIndex < 0 ? {} : { Authorization: 'Bearer ' + createToken(safe(users[userIndex])) }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function link(id = firstId, expected: unknown = manualExpense(id), purchaseId = sourceId, userIndex = 0) {
  return call(linkPath(id), { sourceId: purchaseId, expected }, userIndex);
}

async function unchangedData() {
  return Promise.all([
    'users.json', farmFile('feed-inventory-sync.json'), farmFile('settlement-sync.json'),
    farmFile('cattle.json'), farmFile('expenses-sync.json', otherFarm),
  ].map(raw));
}

beforeEach(async () => {
  previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-feed-purchase-http-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'feed-purchase-fixture-secret';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('feed-purchase-fixture-password');
  users = [
    { id: 'feed-user-first', farmId: farm, plan: 'standard' as const },
    { id: 'feed-user-second', farmId: farm, plan: 'pro' as const },
    { id: 'feed-user-other', farmId: otherFarm, plan: 'pro' as const },
    { id: 'feed-user-free', farmId: farm, plan: 'free' as const },
  ].map(user => ({
    ...user, farmName: 'Fixture Farm', name: 'Fixture User', email: user.id + '@example.invalid',
    role: 'owner', active: true, ...credentials,
  }));
  await put('users.json', users);
  await put(farmFile('expenses-sync.json'), [manualExpense(), manualExpense(secondId)]);
  await put(farmFile('settlement-sync.json'), []);
  await put(farmFile('feed-inventory-sync.json'), [{
    id: sourceId, transactionType: '入庫', sourceType: 'purchased', feedName: 'Fixture Feed',
    transactionDate: '2026-10-31', quantity: '3', unit: '袋', totalPrice: '12500',
  }]);
  await put(farmFile('cattle.json'), [{ id: 'fixture-cattle', name: '変更しない確認用牛' }]);
  await put(farmFile('expenses-sync.json', otherFarm), [manualExpense()]);
  await put(farmFile('settlement-sync.json', otherFarm), []);
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/expenses', expensesRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = 'http://127.0.0.1:' + address.port;
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).origin, origin, 'tests must not contact external services');
    return realFetch(input, init);
  };
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  assert(root.startsWith(path.join(os.tmpdir(), 'farmpro-feed-purchase-http-')));
  await fs.rm(root, { recursive: true, force: true });
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

test('linking adds only the purchase reference and preserves all expense and inventory fields', async () => {
  const untouched = await unchangedData();
  const listed = await (await call('/expenses/record-sync')).json() as Array<Record<string, unknown>>;
  const expected = {
    ...listed.find(record => record.id === firstId), id: 'different-local-id',
    syncRecordId: firstId, cloudUpdatedAt: 'ignored-client-revision', cloudSyncPending: true,
    expenseRetryOrigin: { ignored: true },
  };
  const response = await link(firstId, expected);
  assert.equal(response.status, 200);
  const saved = await response.json() as Record<string, unknown>;
  const { cloudUpdatedAt, ...businessFields } = saved;
  const { cloudUpdatedAt: _originalRevision, ...original } = manualExpense();
  assert.equal(typeof cloudUpdatedAt, 'string');
  assert.deepEqual(businessFields, {
    ...original, sourceType: 'feed-purchase', sourceId, sourceDetail: 'purchase',
  });
  assert.deepEqual(await expenses(), [saved, manualExpense(secondId)]);
  assert.deepEqual(await unchangedData(), untouched);
});

test('an identical lost-ACK link retry is read-only and cannot reassign the purchase', async () => {
  assert.equal((await link()).status, 200);
  const before = await raw(farmFile('expenses-sync.json'));
  assert.equal((await link()).status, 200);
  assert.equal(await raw(farmFile('expenses-sync.json')), before);
  assert.equal((await link(firstId, manualExpense(), 'feed-inventory:different-purchase')).status, 409);
  assert.equal((await link(firstId, { ...manualExpense(), amount: '99999' })).status, 409);
  assert.equal(await raw(farmFile('expenses-sync.json')), before);
});

test('linking detects changes to every reviewed business field and timestamp', async () => {
  const changes: Record<string, unknown> = {
    paymentDate: '2026-11-03', category: 'その他', expenseCategoryMasterId: 10,
    description: '別内容', vendor: 'Other Supplier', vendorMasterId: 9, amount: '12500',
    paymentMethod: '現金', target: '別対象', animalType: 'calf', animalId: 'other-animal',
    animalEarTag: 'OTHER-TAG', animalName: '別牛', memo: '別端末のメモ',
    createdAt: '2026-10-30T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z',
  };
  for (const [key, value] of Object.entries(changes)) {
    await put(farmFile('expenses-sync.json'), [{ ...manualExpense(), [key]: value }]);
    const before = await raw(farmFile('expenses-sync.json'));
    const response = await link();
    assert.equal(response.status, 409, key);
    assert.equal(await raw(farmFile('expenses-sync.json')), before, key);
  }
});

test('deleted, nonmanual, supply-linked and otherwise attributed expenses cannot be linked', async () => {
  const variants = [
    { deletedAt: '2026-11-02T00:00:00.000Z' }, { sourceType: 'treatment' },
    { sourceType: 'breeding' }, { sourceType: 'vaccine' },
    { sourceId: 'another-source' }, { sourceDetail: 'legacy-source' },
    { sourceSupplyMovementId: 'medicine-purchase' }, { sourceSupplyPurchaseReference: 'medicine-receipt' },
    { category: '医薬品費' },
  ];
  for (const variant of variants) {
    const current = { ...manualExpense(), ...variant };
    await put(farmFile('expenses-sync.json'), [current]);
    const before = await raw(farmFile('expenses-sync.json'));
    assert.equal((await link(firstId, current)).status, 409, JSON.stringify(variant));
    assert.equal(await raw(farmFile('expenses-sync.json')), before);
  }
});

test('settlement-linked and projected expenses cannot be linked or changed', async () => {
  for (const projected of [false, true]) {
    await put(farmFile('expenses-sync.json'), projected ? [] : [manualExpense()]);
    await put(farmFile('settlement-sync.json'), [{
      settlement: {
        saleId: 'sale:fixture', settlementNumber: 'SETTLEMENT-FIXTURE', expectedNetYen: 100000,
        expenseIds: projected ? [firstId] : [], linkedExpenseIds: projected ? [] : [firstId],
        createdAt: '2026-11-02T00:00:00.000Z',
      },
      expenses: projected ? [manualExpense()] : [],
      linkedExpenseSnapshots: projected ? [] : [manualExpense()],
    }]);
    const before = await Promise.all([raw(farmFile('expenses-sync.json')), raw(farmFile('settlement-sync.json'))]);
    const response = await link();
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'SETTLEMENT_EXPENSE_IMMUTABLE');
    assert.deepEqual(await Promise.all([raw(farmFile('expenses-sync.json')), raw(farmFile('settlement-sync.json'))]), before);
  }
});

test('two devices linking the same purchase to different expenses accept only one claim', async () => {
  const responses = await Promise.all([
    link(firstId, manualExpense(firstId), sourceId, 0),
    link(secondId, manualExpense(secondId), sourceId, 1),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const rows = await expenses();
  assert.equal(rows.filter(record => record.sourceId === sourceId).length, 1);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const original = manualExpense(String(row.id));
    assert.equal(row.amount, original.amount);
    assert.equal(row.paymentDate, original.paymentDate);
    assert.equal(row.updatedAt, original.updatedAt);
  }
});

test('new feed purchase creation serializes the source claim even with unconditional legacy PUT', async () => {
  for (const headers of [conditional, {}]) {
    await put(farmFile('expenses-sync.json'), [manualExpense()]);
    const first = feedExpense('expense:new-first');
    const second = feedExpense('expense:new-second');
    const responses = await Promise.all([
      call(recordPath(first.id), first, 0, 'PUT', headers),
      call(recordPath(second.id), second, 1, 'PUT', headers),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 412]);
    assert.equal((await expenses()).filter(record => record.sourceId === sourceId).length, 1);
  }
});

test('ordinary feed expense edits preserve the reference and cannot bypass the reviewed link endpoint', async () => {
  const created = feedExpense('expense:new-purchase');
  assert.equal((await call(recordPath(created.id), created, 0, 'PUT', conditional)).status, 200);
  const updated = await call(recordPath(created.id), { amount: '10000', category: 'その他', memo: '訂正後メモ' }, 0, 'PUT');
  assert.equal(updated.status, 200);
  const edited = await updated.json();
  assert.equal(edited.amount, '10000');
  assert.equal(edited.category, 'その他');
  assert.equal(edited.sourceType, 'feed-purchase');
  assert.equal(edited.sourceId, sourceId);
  assert.equal(edited.sourceDetail, 'purchase');
  const before = await raw(farmFile('expenses-sync.json'));
  for (const change of [
    { sourceType: 'manual' }, { sourceId: 'feed-inventory:other' }, { sourceId: null },
    { sourceDetail: '' }, { sourceType: null },
  ]) {
    assert.equal((await call(recordPath(created.id), change, 0, 'PUT')).status, 409);
    assert.equal(await raw(farmFile('expenses-sync.json')), before);
  }
  const copy = feedExpense('expense:copy-after-category-edit');
  assert.equal((await call(recordPath(copy.id), copy, 0, 'PUT')).status, 412);
  assert.equal((await call(recordPath(firstId), { ...manualExpense(), ...created, id: firstId }, 0, 'PUT')).status, 409);
  assert.equal(await raw(farmFile('expenses-sync.json')), before);
});

test('a deleted source claim and historical category/detail changes still block duplicate purchase expenses', async () => {
  const claimed = { ...feedExpense('expense:historic-claim'), category: 'その他', sourceDetail: 'historic-component' };
  for (const deletedAt of [undefined, '2026-11-03T00:00:00.000Z']) {
    await put(farmFile('expenses-sync.json'), [{ ...claimed, deletedAt }, manualExpense()]);
    const before = await raw(farmFile('expenses-sync.json'));
    const copy = feedExpense('expense:duplicate');
    assert.equal((await call(recordPath(copy.id), copy, 0, 'PUT', conditional)).status, 412);
    assert.equal((await link()).status, 409);
    assert.equal(await raw(farmFile('expenses-sync.json')), before);
  }
});

test('create-only checks newly added similar manual expenses and requires explicit separate-payment confirmation', async () => {
  await put(farmFile('expenses-sync.json'), []);
  assert.deepEqual(await (await call('/expenses/record-sync')).json(), []);
  // Another device records a payment after the confirmation screen's GET.
  assert.equal((await call(recordPath(firstId), manualExpense(), 1, 'PUT')).status, 200);
  const purchase = {
    ...feedExpense('expense:similar-purchase'), paymentDate: manualExpense().paymentDate,
    amount: '12500', vendor: '  FIXTURE FEED SUPPLIER  ',
  };
  const before = await raw(farmFile('expenses-sync.json'));
  const blocked = await call(recordPath(purchase.id), purchase, 0, 'PUT', conditional);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).code, 'FEED_PURCHASE_SIMILAR_EXPENSE');
  assert.equal(await raw(farmFile('expenses-sync.json')), before);
  const missingReview = await call(recordPath(purchase.id), purchase, 0, 'PUT', {
    ...conditional, 'X-FarmPro-Allow-Separate-Feed-Payment': 'true',
  });
  assert.equal(missingReview.status, 409);
  assert.equal((await missingReview.json()).code, 'FEED_PURCHASE_SIMILAR_EXPENSE_CHANGED');
  assert.equal(await raw(farmFile('expenses-sync.json')), before);
  const confirmed = await call(recordPath(purchase.id), {
    ...purchase, feedPurchaseConfirmedSimilarExpenses: [manualExpense()],
  }, 0, 'PUT', {
    ...conditional, 'X-FarmPro-Allow-Separate-Feed-Payment': 'true',
  });
  assert.equal(confirmed.status, 200);
  const stored = (await expenses()).find(record => record.id === purchase.id)!;
  assert.equal(stored.amount, '12500');
  assert.equal('allowSeparateFeedPayment' in stored, false);
  assert.equal('X-FarmPro-Allow-Separate-Feed-Payment' in stored, false);
  assert.equal('feedPurchaseConfirmedSimilarExpenses' in stored, false);
  const duplicate = { ...purchase, id: 'expense:still-a-duplicate' };
  assert.equal((await call(recordPath(duplicate.id), duplicate, 0, 'PUT', {
    ...conditional, 'X-FarmPro-Allow-Separate-Feed-Payment': 'true',
  })).status, 412);
});

test('separate-payment confirmation rejects candidates added or edited after the review GET', async () => {
  for (const change of ['added', 'edited']) {
    await put(farmFile('expenses-sync.json'), [manualExpense()]);
    const reviewed = await (await call('/expenses/record-sync')).json();
    if (change === 'added') {
      assert.equal((await call(recordPath(secondId), manualExpense(secondId), 1, 'PUT')).status, 200);
    } else {
      assert.equal((await call(recordPath(firstId), { memo: '別の端末で確認後に変更したメモ' }, 1, 'PUT')).status, 200);
    }
    const purchase = {
      ...feedExpense('expense:separate-after-review'), paymentDate: manualExpense().paymentDate,
      amount: '12500', vendor: 'Fixture Feed Supplier',
    };
    const before = await raw(farmFile('expenses-sync.json'));
    const blocked = await call(recordPath(purchase.id), {
      ...purchase, feedPurchaseConfirmedSimilarExpenses: reviewed,
    }, 0, 'PUT', { ...conditional, 'X-FarmPro-Allow-Separate-Feed-Payment': 'true' });
    assert.equal(blocked.status, 409, change);
    assert.equal((await blocked.json()).code, 'FEED_PURCHASE_SIMILAR_EXPENSE_CHANGED');
    assert.equal(await raw(farmFile('expenses-sync.json')), before);

    const current = await (await call('/expenses/record-sync')).json();
    const confirmed = await call(recordPath(purchase.id), {
      ...purchase, feedPurchaseConfirmedSimilarExpenses: current,
    }, 0, 'PUT', { ...conditional, 'X-FarmPro-Allow-Separate-Feed-Payment': 'true' });
    assert.equal(confirmed.status, 200, change);
    assert.equal('feedPurchaseConfirmedSimilarExpenses' in await confirmed.json(), false);
  }
});

test('a separate-payment header without candidates is sufficient only when the current candidate set is empty', async () => {
  const purchase = feedExpense('expense:no-similar-payment');
  const created = await call(recordPath(purchase.id), purchase, 0, 'PUT', {
    ...conditional, 'X-FarmPro-Allow-Separate-Feed-Payment': 'true',
  });
  assert.equal(created.status, 200);
  const noLongerMatching = { ...feedExpense('expense:changed-candidate-set', 'feed-inventory:other-purchase'), amount: '15000' };
  const before = await raw(farmFile('expenses-sync.json'));
  const blocked = await call(recordPath(noLongerMatching.id), {
    ...noLongerMatching, feedPurchaseConfirmedSimilarExpenses: [manualExpense()],
  }, 0, 'PUT', { ...conditional, 'X-FarmPro-Allow-Separate-Feed-Payment': 'true' });
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).code, 'FEED_PURCHASE_SIMILAR_EXPENSE_CHANGED');
  assert.equal(await raw(farmFile('expenses-sync.json')), before);
});

test('legacy manual and treatment writes retain their previous unconditional behavior', async () => {
  for (const type of ['manual', 'treatment']) {
    for (const id of ['one', 'two']) {
      const record = {
        ...manualExpense('expense:' + type + '-' + id), sourceType: type,
        sourceId: 'same-legacy-source', sourceDetail: 'same-detail',
      };
      assert.equal((await call(recordPath(record.id), record, 0, 'PUT')).status, 200);
      assert.equal((await call(recordPath(record.id), { amount: '15000' }, 0, 'PUT')).status, 200);
    }
  }
  assert.equal((await expenses()).length, 6);
});

test('linking rejects invalid requests, missing expenses, unverified users and free plans without ledger writes', async () => {
  const before = await raw(farmFile('expenses-sync.json'));
  for (const body of [{}, { sourceId: '', expected: manualExpense() }, { sourceId, expected: [] }, { sourceId, expected: null }]) {
    assert.equal((await call(linkPath(firstId), body)).status, 400);
  }
  assert.equal((await link('expense:missing', manualExpense())).status, 404);
  assert.equal((await link(firstId, manualExpense(), sourceId, -1)).status, 401);
  assert.equal((await link(firstId, manualExpense(), sourceId, 3)).status, 403);
  users[0].active = false;
  await put('users.json', users);
  assert.equal((await link()).status, 401);
  assert.equal(await raw(farmFile('expenses-sync.json')), before);
});

test('the same purchase and expense IDs can be linked independently in different authenticated farms', async () => {
  assert.equal((await link()).status, 200);
  const before = await raw(farmFile('expenses-sync.json'));
  assert.equal((await link(firstId, manualExpense(), sourceId, 2)).status, 200);
  assert.equal(await raw(farmFile('expenses-sync.json')), before);
  const other = JSON.parse(await raw(farmFile('expenses-sync.json', otherFarm)));
  assert.equal(other.length, 1);
  assert.equal(other[0].sourceId, sourceId);
});
