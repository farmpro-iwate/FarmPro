import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { writeJson } from './jsonStore';
import {
  deleteSyncedVaccine, findSyncedVaccine, listSyncedVaccines, syncVaccine,
  type SyncedVaccineRecord, type VaccineSyncConditions,
} from './vaccineSyncStore';

const previousDataDir = process.env.FARMPRO_DATA_DIR;
let temporaryDataDir = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-vaccine-conflicts-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
});
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

const firstTime = '2026-11-02T00:00:00.000Z';
const laterTime = '2026-11-02T01:00:00.000Z';
const vaccine = {
  id: 'vaccine:fixture', targetType: '成牛', targetNumber: 'FIXTURE-COW', targetName: 'Fixture cow',
  vaccineName: 'Fixture vaccine', vaccineCost: '1200', vaccinationDate: '', nextDueDate: '2026-11-09',
  status: '未接種', note: 'Original note', createdAt: firstTime, updatedAt: firstTime,
};
const bytes = (farm: string) => fs.readFile(path.join(temporaryDataDir, 'farms', farm, 'vaccines-sync.json'), 'utf8');
const conditionalSync = (input: SyncedVaccineRecord, conditions: VaccineSyncConditions) =>
  syncVaccine(input.id, input, conditions);

test('GET preserves the stored revision and never rewrites the vaccine ledger', async () => {
  const farm = 'vaccine-read-revision-fixture';
  await runWithFarm(farm, async () => {
    await writeJson('vaccines-sync.json', [{ ...vaccine, cloudUpdatedAt: firstTime }]);
    const beforeRead = await bytes(farm);
    const first = await listSyncedVaccines();
    const second = await listSyncedVaccines();
    assert.equal(first[0].cloudUpdatedAt, firstTime);
    assert.deepEqual(second, first);
    assert.deepEqual(await findSyncedVaccine(vaccine.id), first[0]);
    assert.equal(await findSyncedVaccine('vaccine:missing'), undefined);
    assert.equal(await bytes(farm), beforeRead);
  });
});

test('a stale conditional edit cannot replace a newer vaccine record', async () => {
  const farm = 'vaccine-stale-edit-fixture';
  await runWithFarm(farm, async () => {
    const original = await syncVaccine(vaccine.id, vaccine);
    await conditionalSync({ ...original, note: 'Newer edit', updatedAt: laterTime }, { ifMatch: original.cloudUpdatedAt });
    const beforeRetry = await bytes(farm);
    await assert.rejects(conditionalSync({ ...original, note: 'Older offline edit' }, { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    await assert.rejects(deleteSyncedVaccine(vaccine.id, { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), beforeRetry);
  });
});

test('concurrent different edits cannot both consume the same vaccine revision', async () => {
  await runWithFarm('vaccine-concurrent-edit-fixture', async () => {
    const original = await syncVaccine(vaccine.id, vaccine);
    const outcomes = await Promise.allSettled([
      conditionalSync({ ...original, note: 'First edit', updatedAt: laterTime }, { ifMatch: original.cloudUpdatedAt }),
      conditionalSync({ ...original, note: 'Second edit', updatedAt: laterTime }, { ifMatch: original.cloudUpdatedAt }),
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await listSyncedVaccines()).length, 1);
  });
});

test('PUT refuses an attempt to restore a vaccine ID that has been deleted', async () => {
  const farm = 'vaccine-deleted-put-fixture';
  await runWithFarm(farm, async () => {
    const original = await syncVaccine(vaccine.id, vaccine);
    await syncVaccine(vaccine.id, { ...original, deletedAt: laterTime, updatedAt: laterTime });
    const beforeRetry = await bytes(farm);
    await assert.rejects(syncVaccine(vaccine.id, { ...original, note: 'Late live edit' }), /RECORD_DELETED/);
    await assert.rejects(syncVaccine(vaccine.id, { ...original, deletedAt: '', note: 'Late live edit' }), /RECORD_DELETED/);
    assert.equal(await bytes(farm), beforeRetry);
  });
});

test('create-only refuses existing live and deleted IDs, including identical requests', async () => {
  const farm = 'vaccine-create-only-fixture';
  await runWithFarm(farm, async () => {
    const saved = await conditionalSync({ ...vaccine, cloudUpdatedAt: firstTime }, { ifNoneMatch: '*' });
    const before = await bytes(farm);
    await assert.rejects(conditionalSync(saved, { ifNoneMatch: '*' }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);
    await deleteSyncedVaccine(vaccine.id, { ifMatch: saved.cloudUpdatedAt });
    const deleted = await bytes(farm);
    await assert.rejects(conditionalSync(vaccine, { ifNoneMatch: '*' }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), deleted);
  });
});

test('lost PUT acknowledgement is replayed without advancing the revision or copying browser metadata', async () => {
  const farm = 'vaccine-lost-ack-fixture';
  await runWithFarm(farm, async () => {
    const original = await conditionalSync(vaccine, { ifNoneMatch: '*' });
    const localMetadata = {
      cloudSyncPending: true, cloudSyncError: 'Local error', syncRecordId: 'local-sync-alias', syncWarning: 'Local message',
      vaccineSyncOrigin: { ownerId: 'fixture-browser-owner' }, vaccineSyncBase: original,
      vaccineSyncAttempt: { id: 'fixture-attempt' }, vaccineSyncLocalOnly: true,
    };
    const request = { ...original, ...localMetadata, note: 'Committed once', updatedAt: laterTime };
    const saved = await conditionalSync(request, { ifMatch: `"${original.cloudUpdatedAt}"` });
    const before = await bytes(farm);
    const repeated = await conditionalSync(request, { ifMatch: original.cloudUpdatedAt });
    assert.equal(repeated.cloudUpdatedAt, saved.cloudUpdatedAt);
    assert.equal(await bytes(farm), before);
    const received = await findSyncedVaccine(vaccine.id);
    assert(received);
    assert.equal(received.vaccineCost, vaccine.vaccineCost);
    for (const record of [saved, repeated, received, ...(await listSyncedVaccines())]) {
      for (const key of Object.keys(localMetadata)) assert.equal(key in record, false, `${key} must remain on its browser`);
    }
    assert.equal(before.includes('fixture-browser-owner'), false);

    // Pre-existing local metadata is filtered from reads without rewriting history.
    await writeJson('vaccines-sync.json', [{ ...received, ...localMetadata }]);
    const legacyBytes = await bytes(farm);
    for (const record of [await findSyncedVaccine(vaccine.id), ...(await listSyncedVaccines())]) {
      assert(record);
      for (const key of Object.keys(localMetadata)) assert.equal(key in record, false);
    }
    assert.equal(await bytes(farm), legacyBytes);
  });
});

test('successive writes in the same millisecond receive distinct persisted revisions', async (context) => {
  context.mock.method(Date, 'now', () => Date.parse(firstTime));
  await runWithFarm('vaccine-same-clock-fixture', async () => {
    const original = await conditionalSync(vaccine, { ifNoneMatch: '*' });
    const changed = await conditionalSync({ ...original, note: 'Same-clock edit', updatedAt: laterTime }, { ifMatch: original.cloudUpdatedAt });
    assert.equal(Date.parse(changed.cloudUpdatedAt!) - Date.parse(original.cloudUpdatedAt!), 1);
    await assert.rejects(conditionalSync({ ...original, note: 'Same-clock competitor' }, { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
  });
});

test('conditional DELETE is idempotent and retains its original tombstone after a lost response', async () => {
  const farm = 'vaccine-delete-replay-fixture';
  await runWithFarm(farm, async () => {
    const original = await conditionalSync(vaccine, { ifNoneMatch: '*' });
    const deleted = await deleteSyncedVaccine(vaccine.id, { ifMatch: `"${original.cloudUpdatedAt}"` });
    assert.ok(deleted.deletedAt);
    const before = await bytes(farm);
    const repeated = await deleteSyncedVaccine(vaccine.id, { ifMatch: original.cloudUpdatedAt });
    assert.equal(repeated.deletedAt, deleted.deletedAt);
    assert.equal(repeated.cloudUpdatedAt, deleted.cloudUpdatedAt);
    assert.equal((await findSyncedVaccine(vaccine.id))?.cloudUpdatedAt, deleted.cloudUpdatedAt);
    assert.equal(await bytes(farm), before);
  });
});

test('concurrent creations of different vaccine IDs retain both records in the farm ledger', async () => {
  await runWithFarm('vaccine-distinct-create-fixture', async () => {
    await Promise.all([
      conditionalSync(vaccine, { ifNoneMatch: '*' }),
      conditionalSync({ ...vaccine, id: 'vaccine:second-fixture', targetNumber: 'SECOND-COW' }, { ifNoneMatch: '*' }),
    ]);
    assert.deepEqual((await listSyncedVaccines()).map(record => record.id).sort(), ['vaccine:fixture', 'vaccine:second-fixture']);
  });
});

test('unknown-ID deletion blocks delayed creation without changing another farm or the legacy vaccine store', async () => {
  const farm = 'vaccine-delete-unknown-fixture';
  const otherFarm = 'vaccine-untouched-fixture';
  await runWithFarm(otherFarm, () => syncVaccine(vaccine.id, { ...vaccine, note: 'Other farm record' }));
  const otherBefore = await bytes(otherFarm);
  await runWithFarm(farm, async () => {
    await writeJson('vaccines.json', [{ id: 1, note: 'Untouched legacy vaccine' }]);
    const legacyPath = path.join(temporaryDataDir, 'farms', farm, 'vaccines.json');
    const legacyBefore = await fs.readFile(legacyPath, 'utf8');
    await assert.rejects(deleteSyncedVaccine(vaccine.id, { ifMatch: 'missing-revision' }), /PRECONDITION_FAILED/);
    assert.deepEqual(await listSyncedVaccines(), []);
    await deleteSyncedVaccine(vaccine.id, { ifNoneMatch: '*' });
    const before = await bytes(farm);
    await assert.rejects(syncVaccine(vaccine.id, vaccine), /RECORD_DELETED/);
    assert.equal(await bytes(farm), before);
    assert.equal(await fs.readFile(legacyPath, 'utf8'), legacyBefore);
  });
  assert.equal(await bytes(otherFarm), otherBefore);
});

test('legacy unconditional updates remain compatible with old read-time body clocks', async () => {
  await runWithFarm('vaccine-legacy-update-fixture', async () => {
    const original = await syncVaccine(vaccine.id, vaccine);
    const updated = await syncVaccine(vaccine.id, {
      ...original, cloudUpdatedAt: '2099-01-01T00:00:00.000Z', note: 'Legacy edit', updatedAt: laterTime,
    });
    assert.equal(updated.note, 'Legacy edit');
    assert.notEqual(updated.cloudUpdatedAt, '2099-01-01T00:00:00.000Z');
    const deleted = await deleteSyncedVaccine(vaccine.id);
    await assert.rejects(syncVaccine(vaccine.id, { ...updated, cloudUpdatedAt: deleted.cloudUpdatedAt }), /RECORD_DELETED/);
  });
});

test('conditional missing-ID deletion cannot remove a vaccine created after its GET', async () => {
  const farm = 'vaccine-delete-create-race-fixture';
  await runWithFarm(farm, async () => {
    assert.equal(await findSyncedVaccine(vaccine.id), undefined);
    const competing = await conditionalSync(vaccine, { ifNoneMatch: '*' });
    const before = await bytes(farm);
    await assert.rejects(deleteSyncedVaccine(vaccine.id, { ifNoneMatch: '*' }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);
    const deleted = await deleteSyncedVaccine(vaccine.id, { ifMatch: competing.cloudUpdatedAt });
    const deletedBytes = await bytes(farm);
    const repeated = await deleteSyncedVaccine(vaccine.id, { ifNoneMatch: '*' });
    assert.equal(repeated.cloudUpdatedAt, deleted.cloudUpdatedAt);
    assert.equal(repeated.deletedAt, deleted.deletedAt);
    assert.equal(await bytes(farm), deletedBytes);
  });
});

test('invalid preconditions and a missing If-Match target cannot mutate the ledger', async () => {
  const farm = 'vaccine-invalid-condition-fixture';
  await runWithFarm(farm, async () => {
    const original = await syncVaccine(vaccine.id, vaccine);
    const before = await bytes(farm);
    for (const conditions of [
      { ifMatch: '*' }, { ifMatch: '' }, { ifMatch: 'W/"revision"' },
      { ifNoneMatch: 'other' }, { ifMatch: original.cloudUpdatedAt, ifNoneMatch: '*' },
    ]) {
      await assert.rejects(conditionalSync({ ...original, note: 'Rejected' }, conditions), /INVALID_VACCINE_SYNC_CONDITION/);
    }
    await assert.rejects(deleteSyncedVaccine(vaccine.id, { ifNoneMatch: 'other' }), /INVALID_VACCINE_SYNC_CONDITION/);
    await assert.rejects(deleteSyncedVaccine(vaccine.id, { ifMatch: original.cloudUpdatedAt, ifNoneMatch: '*' }), /INVALID_VACCINE_SYNC_CONDITION/);
    await assert.rejects(conditionalSync({ ...vaccine, id: 'vaccine:missing' }, { ifMatch: 'missing-revision' }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);
  });
});
