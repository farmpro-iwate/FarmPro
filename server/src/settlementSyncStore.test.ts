import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { syncExpense, listSyncedExpenses } from './expenseSyncStore';
import { commitCloudSettlement, getCloudSettlement, type CloudSettlementBundle } from './settlementSyncStore';

function fixture(saleId: string): CloudSettlementBundle {
  return {
    settlement: {
      saleId, settlementNumber: 'TEST-001', expectedNetYen: 499000,
      expenseIds: ['expense-test-1'], createdAt: '2026-10-24T00:00:00.000Z',
    },
    expenses: [{
      id: 'expense-test-1', paymentDate: '2026-04-21', category: '手数料',
      description: 'テスト市場手数料', vendor: 'テストJA', amount: '1000', target: 'TEST5954',
    }],
  };
}

test('farm-scoped settlement bundle saves once, rejects duplicates and isolates farms', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-'));
  process.env.FARMPRO_DATA_DIR = dir;
  try {
    await runWithFarm('settlement-test-a', async () => {
      const bundle = fixture('sale-one');
      await commitCloudSettlement(bundle);
      assert.deepEqual(await getCloudSettlement('sale-one'), bundle);
      await assert.rejects(commitCloudSettlement(bundle), /CLOUD_SETTLEMENT_EXISTS/);
      assert.deepEqual(await getCloudSettlement('sale-one'), bundle);
    });
    await runWithFarm('settlement-test-b', async () => {
      assert.equal(await getCloudSettlement('sale-one'), null);
      await commitCloudSettlement(fixture('sale-one'));
      assert.deepEqual(await getCloudSettlement('sale-one'), fixture('sale-one'));
    });
    await runWithFarm('settlement-test-a', async () => {
      assert.deepEqual(await getCloudSettlement('sale-one'), fixture('sale-one'));
    });
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('simultaneous commits for one sale accept exactly one registration', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-race-'));
  process.env.FARMPRO_DATA_DIR = dir;
  try {
    await runWithFarm('settlement-race-test', async () => {
      const attempts = await Promise.allSettled([
        commitCloudSettlement(fixture('sale-race')),
        commitCloudSettlement(fixture('sale-race')),
      ]);
      assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 1);
      assert.equal(attempts.filter(row => row.status === 'rejected').length, 1);
      assert.deepEqual(await getCloudSettlement('sale-race'), fixture('sale-race'));
    });
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('rejects settlement read and write without an authenticated farm context', async () => {
  await assert.rejects(getCloudSettlement('sale-one'), /SETTLEMENT_FARM_REQUIRED/);
  await assert.rejects(commitCloudSettlement(fixture('sale-one')), /SETTLEMENT_FARM_REQUIRED/);
});

test('rejects reusing an expense ID across two different sales in one farm', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-ids-'));
  process.env.FARMPRO_DATA_DIR = dir;
  try {
    await runWithFarm('settlement-unique-id-test', async () => {
      await commitCloudSettlement(fixture('sale-first'));
      await assert.rejects(commitCloudSettlement(fixture('sale-second')), /CLOUD_SETTLEMENT_EXPENSE_ID_CONFLICT/);
      assert.equal(await getCloudSettlement('sale-second'), null);
      assert.deepEqual(await getCloudSettlement('sale-first'), fixture('sale-first'));
    });
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('rejects duplicate expense rows in one settlement', async () => {
  const bad = fixture('sale-duplicate-rows');
  bad.expenses.push({ ...bad.expenses[0] });
  bad.settlement.expenseIds.push('expense-test-2');
  await assert.rejects(commitCloudSettlement(bad), /INVALID_CLOUD_SETTLEMENT/);
});

test('existing synced expense blocks settlement without altering existing cloud data', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-existing-'));
  process.env.FARMPRO_DATA_DIR = dir;
  try {
    await runWithFarm('settlement-existing-test', async () => {
      const original = await syncExpense('expense-test-1', {
        id: 'expense-test-1', paymentDate: '2026-04-21', category: '手数料',
        description: '既存経費', vendor: '既存JA', amount: '1000', target: 'TEST5954',
      });
      await assert.rejects(commitCloudSettlement(fixture('sale-conflict')), /CLOUD_SETTLEMENT_EXISTING_EXPENSE_CONFLICT/);
      assert.equal(await getCloudSettlement('sale-conflict'), null);
      const existing = await listSyncedExpenses();
      assert.equal(existing.length, 1);
      assert.equal(existing[0].id, original.id);
      assert.equal(existing[0].description, original.description);
      assert.equal(existing[0].amount, original.amount);
    });
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('settlement expenses appear in normal cloud expense reads without second write', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-projection-'));
  process.env.FARMPRO_DATA_DIR = dir;
  try {
    await runWithFarm('settlement-projection-test', async () => {
      const bundle = fixture('sale-projected');
      await commitCloudSettlement(bundle);
      const first = await listSyncedExpenses();
      const second = await listSyncedExpenses();
      assert.equal(first.filter(row => row.id === 'expense-test-1').length, 1);
      assert.equal(second.filter(row => row.id === 'expense-test-1').length, 1);
      assert.equal(first.find(row => row.id === 'expense-test-1')?.amount, '1000');
      await assert.rejects(syncExpense('expense-test-1', {
        id: 'expense-test-1', amount: '9999',
      }), /SETTLEMENT_EXPENSE_IMMUTABLE/);
      assert.equal((await listSyncedExpenses()).find(row => row.id === 'expense-test-1')?.amount, '1000');
      await assert.rejects(commitCloudSettlement(fixture('sale-projected-again')), /CLOUD_SETTLEMENT_EXPENSE_ID_CONFLICT/);
    });
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('linked existing expense is preserved and cannot be reused for another sale', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-linked-'));
  process.env.FARMPRO_DATA_DIR = dir;
  try {
    await runWithFarm('settlement-linked-test', async () => {
      const original = await syncExpense('already-paid', {
        id: 'already-paid', paymentDate: '2026-04-21', category: '手数料',
        description: '既存費用', vendor: 'テストJA', amount: '500', target: 'TEST5954',
      });
      const one = fixture('sale-linked');
      one.settlement.linkedExpenseIds = ['already-paid'];
      await commitCloudSettlement(one);
      assert.deepEqual((await getCloudSettlement('sale-linked'))?.settlement.linkedExpenseIds, ['already-paid']);
      assert.equal((await listSyncedExpenses()).find(row => row.id === 'already-paid')?.description, original.description);
      const two = fixture('sale-linked-again');
      two.expenses[0].id = 'expense-another';
      two.settlement.expenseIds = ['expense-another'];
      two.settlement.linkedExpenseIds = ['already-paid'];
      await assert.rejects(commitCloudSettlement(two), /CLOUD_SETTLEMENT_LINK_CONFLICT/);
      assert.equal(await getCloudSettlement('sale-linked-again'), null);
    });
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('existing-expenses-only settlement needs no duplicated expense snapshot', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-only-linked-'));
  process.env.FARMPRO_DATA_DIR = dir;
  try {
    await runWithFarm('settlement-only-linked-test', async () => {
      await syncExpense('already-linked', {
        id: 'already-linked', paymentDate: '2026-04-21', category: '手数料',
        description: '登録済み手数料', vendor: 'テストJA', amount: '1000', target: 'TEST5954',
      });
      const bundle = fixture('sale-only-linked');
      bundle.settlement.expenseIds = [];
      bundle.settlement.linkedExpenseIds = ['already-linked'];
      bundle.expenses = [];
      await commitCloudSettlement(bundle);
      assert.deepEqual(await getCloudSettlement('sale-only-linked'), bundle);
      const rows = await listSyncedExpenses();
      assert.equal(rows.filter(row => row.id === 'already-linked').length, 1);
      assert.equal(rows.length, 1);
    });
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('settlement expense can be reread from another session of same farm but not another farm', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-multidevice-'));
  process.env.FARMPRO_DATA_DIR = dir;
  try {
    await runWithFarm('settlement-farm-a', async () => {
      await commitCloudSettlement(fixture('sale-multidevice'));
      const records = await listSyncedExpenses();
      assert.equal(records.filter(row => row.id === 'expense-test-1').length, 1);
    });
    // A second request/session uses the durable store, not local device state.
    await runWithFarm('settlement-farm-a', async () => {
      const records = await listSyncedExpenses();
      assert.equal(records.filter(row => row.id === 'expense-test-1').length, 1);
      assert.equal(records.find(row => row.id === 'expense-test-1')?.amount, '1000');
      assert.equal((await getCloudSettlement('sale-multidevice'))?.settlement.saleId, 'sale-multidevice');
    });
    await runWithFarm('settlement-farm-b', async () => {
      assert.equal((await listSyncedExpenses()).length, 0);
      assert.equal(await getCloudSettlement('sale-multidevice'), null);
    });
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('invalid expense IDs cannot create a settlement bundle', async () => {
  const bad = fixture('sale-invalid');
  bad.settlement.expenseIds = ['not-matching'];
  await assert.rejects(commitCloudSettlement(bad), /INVALID_CLOUD_SETTLEMENT/);
});

test('new settlement expense preserves calf linkage without changing existing entries', async () => {
  const old = process.env.FARMPRO_DATA_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-settlement-animal-'));
  process.env.FARMPRO_DATA_DIR = dir;
  try {
    await runWithFarm('settlement-animal-test', async () => {
      const bundle = fixture('sale-animal');
      bundle.expenses[0] = {
        ...bundle.expenses[0], target: 'TEST5953',
        animalType: 'calf', animalId: 'calf-test-5953', animalEarTag: 'TEST5953', animalName: '精算テスト牛',
      };
      await commitCloudSettlement(bundle);
      const row = (await listSyncedExpenses()).find(item => item.id === 'expense-test-1');
      assert.equal(row?.animalType, 'calf');
      assert.equal(row?.animalId, 'calf-test-5953');
      assert.equal(row?.animalEarTag, 'TEST5953');
      assert.equal(row?.animalName, '精算テスト牛');
      assert.equal(row?.target, 'TEST5953');
      assert.equal((await listSyncedExpenses()).filter(item => item.id === 'expense-test-1').length, 1);
    });
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
