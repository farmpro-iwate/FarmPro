import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { writeJson } from './jsonStore';
import {
  deleteSyncedTreatment, findSyncedTreatment, listSyncedTreatments, syncTreatment,
  type SyncedTreatmentRecord, type TreatmentSyncConditions,
} from './treatmentSyncStore';

const previousDataDir = process.env.FARMPRO_DATA_DIR;
let temporaryDataDir = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-treatment-conflicts-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
});
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

const firstTime = '2026-11-02T00:00:00.000Z';
const laterTime = '2026-11-02T01:00:00.000Z';
const treatment = {
  id: 'treatment:fixture', recordType: '治療', targetNumber: 'FIXTURE-COW', targetName: 'Fixture cow',
  symptom: 'Fixture symptom', treatmentDate: '2026-11-02', medicine: 'Fixture medicine',
  medicineCost: '01200', medicalFee: '800', note: 'Original note',
  createdAt: firstTime, updatedAt: firstTime,
};
const bytes = (farm: string) => fs.readFile(path.join(temporaryDataDir, 'farms', farm, 'treatments-sync.json'), 'utf8');
const conditionalSync = (id: string, input: SyncedTreatmentRecord, conditions: TreatmentSyncConditions) =>
  syncTreatment(id, input, conditions);

test('GET preserves the persisted treatment revision and never rewrites the ledger', async () => {
  const farm = 'treatment-read-revision-fixture';
  await runWithFarm(farm, async () => {
    const legacy = { ...treatment, id: 'treatment:legacy', legacyBusiness: { exact: '00120' } };
    await writeJson('treatments-sync.json', [{ ...treatment, cloudUpdatedAt: firstTime }, legacy]);
    const beforeRead = await bytes(farm);
    const first = await listSyncedTreatments();
    const second = await listSyncedTreatments();
    assert.equal(first[0].cloudUpdatedAt, firstTime);
    assert.deepEqual(second, first);
    assert.deepEqual(await findSyncedTreatment(legacy.id), { ...legacy, cloudUpdatedAt: firstTime });
    assert.equal(await findSyncedTreatment('treatment:missing'), undefined);
    assert.equal(await bytes(farm), beforeRead);
  });
});

test('a stale conditional edit cannot replace a newer treatment even with a later device clock', async () => {
  const farm = 'treatment-stale-edit-fixture';
  await runWithFarm(farm, async () => {
    const original = await syncTreatment(treatment.id, treatment);
    await conditionalSync(treatment.id, { ...original, note: 'Newer edit', updatedAt: laterTime }, { ifMatch: original.cloudUpdatedAt });
    const beforeRetry = await bytes(farm);
    await assert.rejects(conditionalSync(treatment.id, {
      ...original, note: 'Older offline edit', updatedAt: '2099-01-01T00:00:00.000Z',
    }, { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    await assert.rejects(deleteSyncedTreatment(treatment.id, { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), beforeRetry);
  });
});

test('concurrent different edits cannot both consume the same treatment revision', async () => {
  await runWithFarm('treatment-concurrent-edit-fixture', async () => {
    const original = await syncTreatment(treatment.id, treatment);
    const outcomes = await Promise.allSettled([
      conditionalSync(treatment.id, { ...original, note: 'First edit', updatedAt: laterTime }, { ifMatch: original.cloudUpdatedAt }),
      conditionalSync(treatment.id, { ...original, note: 'Second edit', updatedAt: laterTime }, { ifMatch: original.cloudUpdatedAt }),
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await listSyncedTreatments()).length, 1);
  });
});

test('PUT refuses a late treatment edit after deletion without changing its tombstone', async () => {
  const farm = 'treatment-deleted-put-fixture';
  await runWithFarm(farm, async () => {
    await writeJson('treatments-sync.json', [{ ...treatment, cloudUpdatedAt: laterTime, deletedAt: laterTime }]);
    const beforeRetry = await bytes(farm);
    await assert.rejects(syncTreatment(treatment.id, { ...treatment, note: 'Late live edit' }), /RECORD_DELETED/);
    assert.equal(await bytes(farm), beforeRetry);
  });
});

test('lost PUT acknowledgement preserves the revision and strips only browser sync metadata', async () => {
  const farm = 'treatment-lost-ack-fixture';
  await runWithFarm(farm, async () => {
    const original = await conditionalSync(treatment.id, treatment, { ifNoneMatch: '*' });
    const metadata = {
      syncRecordId: 'local-alias', syncWarning: 'Local warning', cloudSyncPending: true,
      cloudSyncError: 'Local failure', treatmentSyncBase: original,
      treatmentSyncAttempt: { id: 'fixture-attempt' }, treatmentSyncOrigin: { ownerId: 'fixture-owner' },
      treatmentSyncDeletePending: true,
    };
    const request = {
      ...original, ...metadata, note: 'Committed once', updatedAt: laterTime,
      unknownBusiness: { dose: '01.50', nested: [1, null, ''] },
    };
    const saved = await conditionalSync(treatment.id, request, { ifMatch: `"${original.cloudUpdatedAt}"` });
    const before = await bytes(farm);
    const repeated = await conditionalSync(treatment.id, request, { ifMatch: original.cloudUpdatedAt });
    assert.deepEqual(repeated, JSON.parse(JSON.stringify(saved)));
    assert.equal(await bytes(farm), before);
    assert.equal(saved.medicineCost, '01200');
    assert.equal(saved.medicalFee, '800');
    assert.deepEqual((saved as typeof request).unknownBusiness, request.unknownBusiness);
    for (const record of [saved, repeated, await findSyncedTreatment(treatment.id), ...(await listSyncedTreatments())]) {
      assert(record);
      for (const key of Object.keys(metadata)) assert.equal(key in record, false, `${key} must stay on its browser`);
    }
    for (const changed of [
      { ...request, medicineCost: '1200' },
      { ...request, medicalFee: '0800' },
      { ...request, unknownBusiness: { ...request.unknownBusiness, dose: '1.50' } },
      { ...request, updatedAt: firstTime },
    ]) await assert.rejects(conditionalSync(treatment.id, changed, { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);

    // Legacy metadata is hidden without rewriting the original ledger on GET.
    await writeJson('treatments-sync.json', [{ ...saved, ...metadata }]);
    const legacyBytes = await bytes(farm);
    for (const record of [await findSyncedTreatment(treatment.id), ...(await listSyncedTreatments())]) {
      assert(record);
      for (const key of Object.keys(metadata)) assert.equal(key in record, false);
    }
    assert.equal(await bytes(farm), legacyBytes);
  });
});

test('create-only rejects existing live and deleted treatment IDs including identical requests', async () => {
  const farm = 'treatment-create-only-fixture';
  await runWithFarm(farm, async () => {
    const saved = await conditionalSync(treatment.id, treatment, { ifNoneMatch: '*' });
    const before = await bytes(farm);
    await assert.rejects(conditionalSync(treatment.id, saved, { ifNoneMatch: '*' }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);
    await deleteSyncedTreatment(treatment.id, { ifMatch: saved.cloudUpdatedAt });
    const deleted = await bytes(farm);
    await assert.rejects(conditionalSync(treatment.id, treatment, { ifNoneMatch: '*' }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), deleted);
  });
});

test('DELETE replay keeps the original tombstone and the sync feed continues to propagate it', async () => {
  const farm = 'treatment-delete-replay-fixture';
  await runWithFarm(farm, async () => {
    const original = await syncTreatment(treatment.id, { ...treatment, unknownBusiness: 'retain in tombstone' } as SyncedTreatmentRecord);
    const deleted = await deleteSyncedTreatment(treatment.id, { ifMatch: `"${original.cloudUpdatedAt}"` });
    assert.ok(deleted.deletedAt);
    assert.equal(deleted.medicineCost, '01200');
    assert.equal(deleted.medicalFee, '800');
    assert.equal((deleted as Record<string, unknown>).unknownBusiness, 'retain in tombstone');
    const before = await bytes(farm);
    assert.deepEqual(await deleteSyncedTreatment(treatment.id, { ifMatch: original.cloudUpdatedAt }), deleted);
    assert.deepEqual(await deleteSyncedTreatment(treatment.id, { ifNoneMatch: '*' }), deleted);
    assert.deepEqual(await findSyncedTreatment(treatment.id), deleted);
    assert.deepEqual(await listSyncedTreatments(), [deleted]);
    assert.equal(await bytes(farm), before);
  });
});

test('parallel creation of distinct treatment IDs retains both records', async () => {
  await runWithFarm('treatment-distinct-create-fixture', async () => {
    const second = { ...treatment, id: 'treatment:second-fixture', targetNumber: 'SECOND-COW' };
    await Promise.all([
      conditionalSync(treatment.id, treatment, { ifNoneMatch: '*' }),
      conditionalSync(second.id, second, { ifNoneMatch: '*' }),
    ]);
    assert.deepEqual((await listSyncedTreatments()).map(record => record.id).sort(), [treatment.id, second.id].sort());
  });
});

test('an edit and a deletion cannot both consume the same live treatment revision', async () => {
  await runWithFarm('treatment-put-delete-race-fixture', async () => {
    const original = await syncTreatment(treatment.id, treatment);
    const outcomes = await Promise.allSettled([
      conditionalSync(treatment.id, { ...original, note: 'Competing edit', updatedAt: laterTime }, { ifMatch: original.cloudUpdatedAt }),
      deleteSyncedTreatment(treatment.id, { ifMatch: original.cloudUpdatedAt }),
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
    const stored = await findSyncedTreatment(treatment.id);
    assert(stored);
    assert.ok(stored.deletedAt || stored.note === 'Competing edit');
  });
});

test('server revisions advance in the same millisecond and do not depend on device body clocks', async (context) => {
  context.mock.method(Date, 'now', () => Date.parse(laterTime));
  await runWithFarm('treatment-clock-fixture', async () => {
    const original = await syncTreatment(treatment.id, treatment);
    const slower = await conditionalSync(treatment.id, {
      ...original, note: 'Slower device edit', updatedAt: '2000-01-01T00:00:00.000Z',
    }, { ifMatch: original.cloudUpdatedAt });
    assert.equal(Date.parse(slower.cloudUpdatedAt!) - Date.parse(original.cloudUpdatedAt!), 1);
    const legacy = await syncTreatment(treatment.id, {
      ...slower, cloudUpdatedAt: '2099-01-01T00:00:00.000Z', note: 'Legacy body clock', updatedAt: firstTime,
    });
    assert.equal(Date.parse(legacy.cloudUpdatedAt!) - Date.parse(slower.cloudUpdatedAt!), 1);
    assert.equal(legacy.note, 'Legacy body clock');
    await assert.rejects(conditionalSync(treatment.id, { ...slower, note: 'Same-clock competitor' }, {
      ifMatch: slower.cloudUpdatedAt,
    }), /PRECONDITION_FAILED/);
  });
});

test('missing-ID deletion blocks delayed creation without changing another farm or the legacy treatment ledger', async () => {
  const farm = 'treatment-delete-unknown-fixture';
  const otherFarm = 'treatment-untouched-fixture';
  await runWithFarm(otherFarm, () => syncTreatment(treatment.id, { ...treatment, note: 'Other farm record' }));
  const otherBefore = await bytes(otherFarm);
  await runWithFarm(farm, async () => {
    await writeJson('treatments.json', [{ id: 1, medicineCost: '700', note: 'Untouched legacy treatment' }]);
    const legacyPath = path.join(temporaryDataDir, 'farms', farm, 'treatments.json');
    const legacyBefore = await fs.readFile(legacyPath, 'utf8');
    await assert.rejects(deleteSyncedTreatment(treatment.id, { ifMatch: firstTime }), /PRECONDITION_FAILED/);
    assert.equal(await findSyncedTreatment(treatment.id), undefined);
    const deleted = await deleteSyncedTreatment(treatment.id, { ifNoneMatch: '*' });
    assert.ok(deleted.deletedAt);
    const before = await bytes(farm);
    await assert.rejects(syncTreatment(treatment.id, treatment), /RECORD_DELETED/);
    assert.equal(await bytes(farm), before);

    const raceId = 'treatment:created-after-read';
    assert.equal(await findSyncedTreatment(raceId), undefined);
    await conditionalSync(raceId, { ...treatment, id: raceId }, { ifNoneMatch: '*' });
    const racingBytes = await bytes(farm);
    await assert.rejects(deleteSyncedTreatment(raceId, { ifNoneMatch: '*' }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), racingBytes);
    assert.ok((await deleteSyncedTreatment('treatment:legacy-missing')).deletedAt);
    assert.equal(await fs.readFile(legacyPath, 'utf8'), legacyBefore);
  });
  assert.equal(await bytes(otherFarm), otherBefore);
});

test('invalid conditions, malformed bodies and deletion flags cannot change stored treatment data', async () => {
  const farm = 'treatment-invalid-input-fixture';
  await runWithFarm(farm, async () => {
    const original = await syncTreatment(treatment.id, treatment);
    const before = await bytes(farm);
    for (const conditions of [
      { ifMatch: '*' }, { ifMatch: '' }, { ifMatch: 'W/"revision"' }, { ifMatch: '"a","b"' },
      { ifNoneMatch: 'other' }, { ifMatch: original.cloudUpdatedAt, ifNoneMatch: '*' },
    ]) {
      await assert.rejects(conditionalSync(treatment.id, { ...original, note: 'Rejected' }, conditions), /INVALID_TREATMENT_SYNC_CONDITION/);
      await assert.rejects(deleteSyncedTreatment(treatment.id, conditions), /INVALID_TREATMENT_SYNC_CONDITION/);
    }
    for (const body of [null, [], 'invalid', ...['', null, false, firstTime].map(deletedAt => ({ ...original, deletedAt }))]) {
      await assert.rejects(syncTreatment(treatment.id, body as SyncedTreatmentRecord), /INVALID_TREATMENT_SYNC_INPUT/);
    }
    await assert.rejects(conditionalSync('treatment:missing', { ...treatment, id: 'treatment:missing' }, { ifMatch: firstTime }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);
  });
});

test('explicit null clears treatment selections and stock links while omitted fields and unknown costs survive', async () => {
  const farm = 'treatment-null-clear-fixture';
  await runWithFarm(farm, async () => {
    const original = await syncTreatment(treatment.id, {
      ...treatment, diseaseMasterId: 12, treatmentProcedureMasterId: 13, treatmentCourseId: 'course-fixture',
      medicineSource: 'farm_stock', medicineInventoryMovementId: 'stock-fixture',
      medicineInventoryBatchKey: 'batch-fixture', medicineInventoryQuantity: 2,
      unknownCost: { raw: '00120.50', unit: '分包' },
    } as SyncedTreatmentRecord);
    const partial = await conditionalSync(treatment.id, { id: treatment.id, note: 'Partial legacy update' }, {
      ifMatch: original.cloudUpdatedAt,
    });
    assert.equal(partial.diseaseMasterId, 12);
    assert.equal(partial.medicineInventoryMovementId, 'stock-fixture');
    const cleared = await conditionalSync(treatment.id, {
      id: treatment.id, diseaseMasterId: null, treatmentProcedureMasterId: null, treatmentCourseId: null,
      medicineSource: 'veterinarian', medicineInventoryMovementId: null,
      medicineInventoryBatchKey: null, medicineInventoryQuantity: null, updatedAt: laterTime,
    }, { ifMatch: partial.cloudUpdatedAt });
    for (const key of ['diseaseMasterId', 'treatmentProcedureMasterId', 'treatmentCourseId',
      'medicineInventoryMovementId', 'medicineInventoryBatchKey', 'medicineInventoryQuantity']) {
      assert.equal((cleared as Record<string, unknown>)[key], null);
    }
    assert.equal(cleared.medicineCost, '01200');
    assert.equal(cleared.medicalFee, '800');
    assert.deepEqual((cleared as Record<string, unknown>).unknownCost, { raw: '00120.50', unit: '分包' });
    assert.equal(cleared.note, 'Partial legacy update');
    assert.deepEqual(await findSyncedTreatment(treatment.id), JSON.parse(JSON.stringify(cleared)));
  });
});
