import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { writeJson } from './jsonStore';
import { listSyncedSales, syncSale, type SyncedSaleRecord } from './salesSyncStore';

const previousDataDir = process.env.FARMPRO_DATA_DIR;
let root = '';
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-sale-duplicates-'));
  process.env.FARMPRO_DATA_DIR = root;
});
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (root) await fs.rm(root, { recursive: true, force: true });
});

const sale = (id: string, overrides: Partial<SyncedSaleRecord> = {}): SyncedSaleRecord => ({
  id, targetType: '子牛', targetNumber: 'TEST-6408', targetName: '検証子牛',
  calfId: 'test-calf-6408', birthday: '2026-02-06', status: '出荷予定',
  shippingPlanDate: '2026-11-18', saleDate: '', salePrice: '', ...overrides,
});

test('parallel distinct IDs for one calf serialize and one is rejected', async () => {
  await runWithFarm('sales-parallel-fixture', async () => {
    const outcomes = await Promise.allSettled([
      syncSale('sale:first', sale('sale:first')),
      syncSale('sale:second', sale('sale:second', { status: '販売済み', saleDate: '2026-11-18', salePrice: '865000' })),
    ]);
    assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(x => x.status === 'rejected').length, 1);
    assert.match(String((outcomes.find(x => x.status === 'rejected') as PromiseRejectedResult).reason), /SALE_ANIMAL_DUPLICATE/);
    assert.equal((await listSyncedSales()).length, 1);
  });
});

test('identity fallback uses both ear number and birthday; different calves remain allowed', async () => {
  await runWithFarm('sales-fallback-fixture', async () => {
    await syncSale('a', sale('a', { calfId: '' }));
    await assert.rejects(syncSale('b', sale('b', { calfId: 'calf-new' })), /SALE_ANIMAL_DUPLICATE/);
    await syncSale('c', sale('c', { calfId: '', birthday: '2025-02-06' }));
    await syncSale('d', sale('d', { calfId: '', targetNumber: 'TEST-6409' }));
    assert.equal((await listSyncedSales()).length, 3);
  });
});

test('legacy duplicate sale history survives unchanged edits but new activations are blocked', async () => {
  await runWithFarm('sales-existing-duplicates-fixture', async () => {
    const original = sale('old-plan');
    const sold = sale('old-sold', { status: '販売済み', salePrice: '865000', saleDate: '2026-11-18' });
    await writeJson('sales-sync.json', [original, sold]);
    const edited = await syncSale(original.id, { ...original, memo: '検証のための履歴注記' });
    assert.equal(edited.memo, '検証のための履歴注記');
    await assert.rejects(syncSale(original.id, { ...original, status: '販売済み', saleDate: '2026-11-18', salePrice: '865000' }), /SALE_ANIMAL_DUPLICATE/);
    await assert.rejects(syncSale('third', sale('third')), /SALE_ANIMAL_DUPLICATE/);
    assert.equal((await listSyncedSales()).length, 2);
  });
});

test('canceled and deleted records do not block new records; separate farms are independent', async () => {
  await runWithFarm('sales-history-fixture', async () => {
    await syncSale('cancelled', sale('cancelled', { status: '取消' }));
    await syncSale('active', sale('active'));
    await syncSale('another', sale('another', { calfId: 'another-calf', targetNumber: 'OTHER-100' }));
    assert.equal((await listSyncedSales()).length, 3);
  });
  await runWithFarm('sales-another-farm-fixture', async () => {
    await syncSale('other', sale('other'));
    assert.equal((await listSyncedSales()).length, 1);
  });
});
