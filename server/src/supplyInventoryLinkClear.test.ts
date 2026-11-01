import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { listSyncedTreatments, syncTreatment, type SyncedTreatmentRecord } from './treatmentSyncStore';
import { listBreedings, syncBreeding, type BreedingSyncInput } from './breedingStore';

const previousDataDir = process.env.FARMPRO_DATA_DIR;
let temporaryDataDir = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-stock-link-clear-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
});
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

// Match the parsed HTTP request boundary. Explicit JSON null must survive even
// though the existing store's optional TypeScript fields predate nullable clears.
function requestBody<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test('treatment stock cancellation clears stored references through explicit JSON null', async () => {
  await runWithFarm('stock-link-clear-treatment-test', async () => {
    const id = 'treatment:synthetic-stock-test';
    const original = await syncTreatment(id, {
      id, targetNumber: 'TEST-COW', targetName: '試験牛', medicine: '試験薬',
      medicineSource: 'farm_stock', medicineInventoryMovementId: 'treatment-stock-test',
      medicineInventoryBatchKey: 'test-medicine-batch', medicineInventoryQuantity: 2,
      note: '解除しても保持する治療メモ', createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    assert.equal((await listSyncedTreatments())[0].medicineInventoryMovementId, 'treatment-stock-test');

    await syncTreatment(id, requestBody<SyncedTreatmentRecord>({
      ...original, medicineSource: 'veterinarian', medicineInventoryMovementId: null,
      medicineInventoryBatchKey: null, medicineInventoryQuantity: null,
      updatedAt: '2026-11-01T01:00:00.000Z',
    }));

    const records = await listSyncedTreatments();
    assert.equal(records.length, 1);
    const received = records[0];
    assert.equal(received.id, id);
    assert.equal(received.medicineSource, 'veterinarian');
    assert.equal(received.medicineInventoryMovementId, null);
    assert.equal(received.medicineInventoryBatchKey, null);
    assert.equal(received.medicineInventoryQuantity, null);
    assert.equal(received.targetNumber, original.targetNumber);
    assert.equal(received.medicine, original.medicine);
    assert.equal(received.note, original.note);
  });
});

test('ET cancellation clears stored embryo references through explicit JSON null', async () => {
  await runWithFarm('stock-link-clear-embryo-test', async () => {
    const id = 'synthetic-embryo-transfer-test';
    const original = await syncBreeding(id, requestBody<BreedingSyncInput>({
      cowEarTag: 'TEST-COW', cowName: '試験牛', breedingMethod: '受精卵移植',
      breedingStatus: '移植実施', transferDate: '2026-11-01', embryoSource: 'farm_stock',
      embryoNumber: 'TEST-EMBRYO', embryoInventoryMovementId: 'embryo-stock-test',
      embryoInventoryBatchKey: 'test-embryo-batch', note: '解除しても保持する移植メモ',
      createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    }));
    assert.equal((await listBreedings())[0].embryoInventoryMovementId, 'embryo-stock-test');

    await syncBreeding(id, requestBody<BreedingSyncInput>({
      ...original, breedingStatus: '中止', embryoInventoryMovementId: null,
      embryoInventoryBatchKey: null, updatedAt: '2026-11-01T01:00:00.000Z',
    }));

    const records = await listBreedings();
    assert.equal(records.length, 1);
    const received = records[0];
    assert.equal(received.id, id);
    assert.equal(received.breedingStatus, '中止');
    assert.equal(received.embryoInventoryMovementId, null);
    assert.equal(received.embryoInventoryBatchKey, null);
    assert.equal(received.cowEarTag, original.cowEarTag);
    assert.equal(received.embryoNumber, original.embryoNumber);
    assert.equal(received.note, original.note);
  });
});
