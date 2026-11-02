import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { writeJson } from './jsonStore';
import { deleteSyncedManagementRecord, findSyncedManagementRecord, listSyncedManagementRecords,
  syncManagementRecord, type ManagementSyncResource, type ManagementSyncRecord } from './managementRecordSyncStore';

const previousDataDir = process.env.FARMPRO_DATA_DIR;
let root = '';
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-management-store-'));
  process.env.FARMPRO_DATA_DIR = root;
});
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (root) await fs.rm(root, { recursive: true, force: true });
});
const firstTime = '2026-11-01T00:00:00.000Z';
const laterTime = '2026-11-02T00:00:00.000Z';
const resources: ManagementSyncResource[] = ['feedingAlertActions', 'fatteningTransitions'];
const fileNames = { feedingAlertActions: 'feeding-alert-actions-sync.json', fatteningTransitions: 'fattening-transitions-sync.json' };
const fixture = (id: string): ManagementSyncRecord => ({
  id, memo: 'Original', targetNumber: `FIXTURE-${id}`, status: '未対応', actionDate: '2026-11-02',
  createdAt: firstTime, updatedAt: firstTime, unknownBusiness: { value: '001.20', items: [null, '', 1] },
});
const bytes = (farm: string, resource: ManagementSyncResource) => fs.readFile(path.join(root, 'farms', farm, fileNames[resource]), 'utf8');
const create = { ifNoneMatch: '*' };

for (const resource of resources) {
  test(`${resource} reads are non-destructive and use stable persisted revisions`, async () => {
    const farm = `${resource}-read-fixture`;
    await runWithFarm(farm, async () => {
      assert.deepEqual(await listSyncedManagementRecords(resource), []);
      assert.equal(await findSyncedManagementRecord(resource, 'missing'), undefined);
      await assert.rejects(bytes(farm, resource), { code: 'ENOENT' });
      const legacyClock = fixture('persisted-clock');
      await writeJson(fileNames[resource], [legacyClock]);
      const before = await bytes(farm, resource);
      assert.deepEqual(await listSyncedManagementRecords(resource), [{ ...legacyClock, cloudUpdatedAt: firstTime }]);
      assert.deepEqual(await findSyncedManagementRecord(resource, legacyClock.id), { ...legacyClock, cloudUpdatedAt: firstTime });
      assert.equal(await bytes(farm, resource), before);
    });
  });

  test(`${resource} conditional updates preserve unknown fields, nullable business values and exact ACK revisions`, async context => {
    context.mock.method(Date, 'now', () => Date.parse(laterTime));
    const farm = `${resource}-conditions-fixture`;
    await runWithFarm(farm, async () => {
      await assert.rejects(syncManagementRecord(resource, 'record', fixture('record')), /PRECONDITION_REQUIRED/);
      await assert.rejects(deleteSyncedManagementRecord(resource, 'record'), /PRECONDITION_REQUIRED/);
      for (const invalid of [{ ifMatch: '*' }, { ifMatch: 'invalid' }, { ifNoneMatch: 'bad' }, { ifMatch: firstTime, ifNoneMatch: '*' }]) {
        await assert.rejects(syncManagementRecord(resource, 'record', fixture('record'), invalid), /INVALID_MANAGEMENT_SYNC_CONDITION/);
      }
      const original = await syncManagementRecord(resource, 'record', fixture('record'), create);
      const prefix = resource === 'feedingAlertActions' ? 'feedingAlertActionSync' : 'fatteningTransitionSync';
      const request = { ...fixture('record'), memo: null, updatedAt: null, syncRecordId: 'local-only', syncWarning: 'local-only',
        cloudSyncPending: true, [`${prefix}Origin`]: { ownerId: 'fixture' }, [`${prefix}Attempt`]: { pending: true } };
      const saved = await syncManagementRecord(resource, 'record', request, { ifMatch: original.cloudUpdatedAt });
      assert.equal(Date.parse(saved.cloudUpdatedAt!) - Date.parse(original.cloudUpdatedAt!), 1);
      assert.equal(saved.memo, null); assert.equal(saved.updatedAt, null);
      assert.deepEqual(saved.unknownBusiness, fixture('record').unknownBusiness);
      assert.equal(saved.createdAt, firstTime);
      for (const key of ['syncRecordId', 'syncWarning', 'cloudSyncPending', `${prefix}Origin`, `${prefix}Attempt`]) assert.equal(key in saved, false);
      const before = await bytes(farm, resource);
      assert.deepEqual(await syncManagementRecord(resource, 'record', request, { ifMatch: original.cloudUpdatedAt }), saved);
      assert.deepEqual(await syncManagementRecord(resource, 'record', { id: 'record', memo: null }, { ifMatch: original.cloudUpdatedAt }), saved);
      await assert.rejects(syncManagementRecord(resource, 'record', { ...request, unknownBusiness: { value: '1.20' } },
        { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
      await assert.rejects(deleteSyncedManagementRecord(resource, 'record', { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
      await assert.rejects(syncManagementRecord(resource, 'record', request, create), /PRECONDITION_FAILED/);
      assert.equal(await bytes(farm, resource), before);
      const cleared = await syncManagementRecord(resource, 'record', { id: 'record', unknownBusiness: null, memo: '' }, { ifMatch: saved.cloudUpdatedAt });
      assert.equal(cleared.unknownBusiness, null); assert.equal(cleared.memo, '');
      assert.equal(cleared.updatedAt, null); assert.equal(cleared.createdAt, firstTime);
    });
  });

  test(`${resource} locks concurrent writes and protects absence deletion from late revival`, async () => {
    const farm = `${resource}-race-fixture`;
    await runWithFarm(farm, async () => {
      const [first, second] = await Promise.all(['one', 'two'].map(id => syncManagementRecord(resource, id, fixture(id), create)));
      assert.equal((await listSyncedManagementRecords(resource)).length, 2);
      for (const [index, original] of [first, second].entries()) {
        const outcomes = await Promise.allSettled([
          syncManagementRecord(resource, original.id, { ...original, memo: 'First edit' }, { ifMatch: original.cloudUpdatedAt }),
          index === 0 ? syncManagementRecord(resource, original.id, { ...original, memo: 'Second edit' }, { ifMatch: original.cloudUpdatedAt })
            : deleteSyncedManagementRecord(resource, original.id, { ifMatch: original.cloudUpdatedAt }),
        ]);
        assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
        assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1);
      }
      const deleted = await deleteSyncedManagementRecord(resource, 'absent', create);
      const before = await bytes(farm, resource);
      await assert.rejects(syncManagementRecord(resource, deleted.id, fixture(deleted.id), create), /PRECONDITION_FAILED/);
      await assert.rejects(syncManagementRecord(resource, deleted.id, fixture(deleted.id), { ifMatch: deleted.cloudUpdatedAt }), /RECORD_DELETED/);
      assert.deepEqual(await deleteSyncedManagementRecord(resource, deleted.id, { ifMatch: firstTime }), deleted);
      assert.equal(await bytes(farm, resource), before);
    });
  });
}

test('fattening creation rejects overlapping active identities across parallel devices but not other farms or shipped history', async () => {
  const resource = 'fatteningTransitions';
  await runWithFarm('fattening-create-duplicates', async () => {
    const outcomes = await Promise.allSettled(['a', 'b'].map(id => syncManagementRecord(resource, id,
      { ...fixture(id), targetNumber: id === 'a' ? ' SAME-FIXTURE ' : 'SAME-FIXTURE', status: '肥育中' }, create)));
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1);
    await assert.rejects(syncManagementRecord(resource, 'new-shipped', { ...fixture('new-shipped'), targetNumber: 'SAME-FIXTURE', status: '出荷済み' }, create), /FATTENING_ACTIVE_DUPLICATE/);
    const active = (await listSyncedManagementRecords(resource))[0];
    await deleteSyncedManagementRecord(resource, active.id, { ifMatch: active.cloudUpdatedAt });
    await syncManagementRecord(resource, 'shipped', { ...fixture('shipped'), targetNumber: 'SAME-FIXTURE', status: '出荷済み' }, create);
    await syncManagementRecord(resource, 'new-active', { ...fixture('new-active'), targetNumber: 'SAME-FIXTURE', status: '出荷準備' }, create);
    for (const id of ['empty-a', 'empty-b']) await syncManagementRecord(resource, id, { ...fixture(id), targetNumber: ' ' }, create);
    assert.equal((await listSyncedManagementRecords(resource)).length, 5);
  });
  await runWithFarm('fattening-unrelated-farm', async () => {
    const saved = await syncManagementRecord(resource, 'a', { ...fixture('a'), targetNumber: 'SAME-FIXTURE' }, create);
    assert.equal(saved.targetNumber, 'SAME-FIXTURE');
  });
});

test('fattening activation and ear-tag changes cannot increase active overlap, while existing duplicate history remains editable', async () => {
  const resource = 'fatteningTransitions';
  await runWithFarm('fattening-activation-fixture', async () => {
    const archived = await Promise.all(['first', 'second'].map(id => syncManagementRecord(resource, id,
      { ...fixture(id), targetNumber: 'ACTIVATE-FIXTURE', status: '出荷済み' }, create)));
    const outcomes = await Promise.allSettled(archived.map(record => syncManagementRecord(resource, record.id,
      { ...record, status: '肥育中' }, { ifMatch: record.cloudUpdatedAt })));
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1);
    const saved = (outcomes.find(outcome => outcome.status === 'fulfilled') as PromiseFulfilledResult<ManagementSyncRecord>).value;
    const other = await syncManagementRecord(resource, 'different-ear', { ...fixture('different-ear'), targetNumber: 'OTHER-FIXTURE', status: '肥育中' }, create);
    await assert.rejects(syncManagementRecord(resource, other.id, { ...other, targetNumber: ' ACTIVATE-FIXTURE ' }, { ifMatch: other.cloudUpdatedAt }), /FATTENING_ACTIVE_DUPLICATE/);
    const historicalDuplicate = { ...saved, id: 'historical-duplicate' };
    await writeJson(fileNames[resource], [...await listSyncedManagementRecords(resource), historicalDuplicate]);
    const edit = { ...saved, memo: 'An existing history entry may be corrected', status: '出荷準備' };
    const changed = await syncManagementRecord(resource, saved.id, edit, { ifMatch: saved.cloudUpdatedAt });
    assert.deepEqual(await syncManagementRecord(resource, saved.id, edit, { ifMatch: saved.cloudUpdatedAt }), changed);
    assert.equal((await findSyncedManagementRecord(resource, historicalDuplicate.id))?.memo, saved.memo);
    const shipped = await syncManagementRecord(resource, saved.id, { ...changed, status: '出荷済み' }, { ifMatch: changed.cloudUpdatedAt });
    assert.equal(shipped.status, '出荷済み');
  });
});
