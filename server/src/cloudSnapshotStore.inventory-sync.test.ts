import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { getCloudSnapshot, saveCloudSnapshot, type CloudSnapshot } from './cloudSnapshotStore';

// Real store tests use synthetic records and a private temporary data root.
// Even readJson's missing-file fallback must never reach an existing farm.
const previousDataDir = process.env.FARMPRO_DATA_DIR;
let temporaryDataDir = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-inventory-snapshot-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
});
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

function fixture(farmId: string): CloudSnapshot {
  return {
    format: 'farmpro-backup', schemaVersion: 4, appVersion: 'inventory-sync-test',
    exportedAt: '2026-11-01T00:00:00.000Z', farm: { id: farmId, name: '同期テスト農場' },
    stores: {
      supplyInventory: [
        { id: 'test-medicine-purchase', kind: '医薬品', action: '購入', quantity: 4, note: 'original' },
        { id: 'test-embryo-purchase', kind: '受精卵', action: '購入', quantity: 2, note: 'unchanged' },
      ],
      cattle: [{ id: 1, name: 'テスト牛', note: 'original cattle' }],
      expenses: [{ id: 'test-expense', amount: '1000', paymentMethod: '現金' }],
      treatments: [], breedings: [],
      metadata: [{ id: 'test-metadata', farmName: '同期テスト農場' }],
    },
  };
}

function withInventoryNote(snapshot: CloudSnapshot, note: string): CloudSnapshot {
  return {
    ...snapshot,
    stores: {
      ...snapshot.stores,
      supplyInventory: snapshot.stores.supplyInventory.map((value) => {
        const row = value as Record<string, unknown>;
        return row.id === 'test-medicine-purchase' ? { ...row, note } : row;
      }),
    },
  };
}

test('concurrent inventory snapshot writes at the same revision accept exactly one candidate', async () => {
  const farmId = 'inventory-snapshot-concurrent';
  await runWithFarm(farmId, async () => {
    const initial = await saveCloudSnapshot(farmId, fixture(farmId), null);
    const candidates = [
      withInventoryNote(initial.snapshot, 'PC edit'),
      withInventoryNote(initial.snapshot, 'phone edit'),
    ];
    const outcomes = await Promise.allSettled(candidates.map((candidate) =>
      saveCloudSnapshot(farmId, candidate, initial.revision)));

    const winner = outcomes.findIndex((result) => result.status === 'fulfilled');
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 1);
    const rejected = outcomes.find((result) => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected');
    assert.equal((rejected.reason as Error).message, 'CLOUD_SNAPSHOT_CONFLICT');

    const stored = await getCloudSnapshot(farmId);
    assert.ok(stored);
    assert.equal(stored.revision, initial.revision + 1);
    assert.deepEqual(stored.snapshot, candidates[winner]);
  });
});

test('retrying inventory from the latest snapshot preserves another device edits in every other store', async () => {
  const farmId = 'inventory-snapshot-rebase';
  await runWithFarm(farmId, async () => {
    const initial = await saveCloudSnapshot(farmId, fixture(farmId), null);
    const staleInventoryCandidate = withInventoryNote(initial.snapshot, 'inventory edit');
    const anotherDevice = {
      ...initial.snapshot,
      stores: {
        ...initial.snapshot.stores,
        cattle: [{ id: 1, name: 'テスト牛', note: 'edited on another device' }],
        expenses: [{ id: 'test-expense', amount: '1250', paymentMethod: '振込' }],
        treatments: [{ id: 'test-treatment', note: 'another device added this' }],
      },
    };
    const latest = await saveCloudSnapshot(farmId, anotherDevice, initial.revision);

    await assert.rejects(
      saveCloudSnapshot(farmId, staleInventoryCandidate, initial.revision),
      /CLOUD_SNAPSHOT_CONFLICT/,
    );
    assert.deepEqual(await getCloudSnapshot(farmId), latest);

    const remote = await getCloudSnapshot(farmId);
    assert.ok(remote);
    const candidate = withInventoryNote(remote.snapshot, 'inventory edit');
    await saveCloudSnapshot(farmId, candidate, remote.revision);
    const saved = await getCloudSnapshot(farmId);
    assert.ok(saved);
    assert.equal(saved.revision, latest.revision + 1);
    assert.deepEqual(saved.snapshot.stores.supplyInventory, staleInventoryCandidate.stores.supplyInventory);
    for (const [name, records] of Object.entries(latest.snapshot.stores)) {
      if (name !== 'supplyInventory') assert.deepEqual(saved.snapshot.stores[name], records, name);
    }
  });
});

test('a mismatching snapshot farm is refused without changing either farm', async () => {
  const farmA = 'inventory-snapshot-farm-a';
  const farmB = 'inventory-snapshot-farm-b';
  const initialA = await runWithFarm(farmA, () => saveCloudSnapshot(farmA, fixture(farmA), null));
  const initialB = await runWithFarm(farmB, () => saveCloudSnapshot(farmB, fixture(farmB), null));

  await runWithFarm(farmA, async () => {
    await assert.rejects(
      saveCloudSnapshot(farmA, withInventoryNote(initialB.snapshot, 'wrong farm edit'), initialA.revision),
      /CLOUD_SNAPSHOT_FARM_MISMATCH/,
    );
    assert.deepEqual(await getCloudSnapshot(farmA), initialA);
  });
  assert.deepEqual(await runWithFarm(farmB, () => getCloudSnapshot(farmB)), initialB);
});

test('reading an existing inventory snapshot leaves revision, saved time and contents unchanged', async (context) => {
  const farmId = 'inventory-snapshot-read-only';
  const savedTime = Date.parse('2026-11-01T00:00:00.000Z');
  context.mock.timers.enable({ apis: ['Date'], now: savedTime });
  await runWithFarm(farmId, async () => {
    const initial = await saveCloudSnapshot(farmId, fixture(farmId), null);
    context.mock.timers.setTime(savedTime + 60_000);
    assert.deepEqual(await getCloudSnapshot(farmId), initial);
    context.mock.timers.setTime(savedTime + 120_000);
    assert.deepEqual(await getCloudSnapshot(farmId), initial);
  });
});

test('a read after a lost save response identifies the committed inventory change without another write', async () => {
  const farmId = 'inventory-snapshot-lost-response';
  await runWithFarm(farmId, async () => {
    const initial = await saveCloudSnapshot(farmId, fixture(farmId), null);
    const candidate = withInventoryNote(initial.snapshot, 'confirmed after reconnect');
    // Intentionally discard the successful result, as if the response was lost.
    await saveCloudSnapshot(farmId, candidate, initial.revision);

    const recovered = await getCloudSnapshot(farmId);
    assert.ok(recovered);
    assert.equal(recovered.revision, initial.revision + 1);
    assert.deepEqual(recovered.snapshot, candidate);
    assert.equal(recovered.snapshot.stores.supplyInventory.length, initial.snapshot.stores.supplyInventory.length);
    assert.deepEqual(await getCloudSnapshot(farmId), recovered);

    // Retrying the old request cannot create a second committed generation.
    await assert.rejects(
      saveCloudSnapshot(farmId, candidate, initial.revision),
      /CLOUD_SNAPSHOT_CONFLICT/,
    );
    assert.deepEqual(await getCloudSnapshot(farmId), recovered);
  });
});
