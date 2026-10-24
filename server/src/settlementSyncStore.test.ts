import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
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

test('invalid expense IDs cannot create a settlement bundle', async () => {
  const bad = fixture('sale-invalid');
  bad.settlement.expenseIds = ['not-matching'];
  await assert.rejects(commitCloudSettlement(bad), /INVALID_CLOUD_SETTLEMENT/);
});
