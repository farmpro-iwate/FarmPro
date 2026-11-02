import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { writeJson } from './jsonStore';
import { deleteSyncedBlvTest, findSyncedBlvTest, listSyncedBlvTests, syncBlvTest } from './blvSyncStore';

const previousDataDir = process.env.FARMPRO_DATA_DIR;
let temporaryDataDir = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-blv-conflicts-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
});
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

const firstTime = '2026-11-01T00:00:00.000Z';
const laterTime = '2026-11-02T00:00:00.000Z';
const input = {
  id: 'blv:fixture', cowEarTag: 'BLV-FIXTURE-COW', cowName: 'Fixture cow',
  testDate: '2026-11-02', result: '陰性', nextTestDate: '2027-05-02', isolationMemo: '', note: 'Original',
  createdAt: firstTime, updatedAt: firstTime, laboratory: { value: '001.20', items: [null, 1, ''] },
};
const conditions = { ifNoneMatch: '*' };
const bytes = (farm: string, name = 'blv-tests-sync.json') => fs.readFile(path.join(temporaryDataDir, 'farms', farm, name), 'utf8');

test('BLV empty GET never creates a sync ledger or migrates legacy records', async () => {
  const farm = 'blv-read-empty-fixture';
  await runWithFarm(farm, async () => {
    await writeJson('blvTests.json', [{ ...input, id: 42 }]);
    const before = await bytes(farm, 'blvTests.json');
    assert.deepEqual(await listSyncedBlvTests(), []);
    assert.equal(await findSyncedBlvTest('blv:42'), undefined);
    await assert.rejects(bytes(farm), { code: 'ENOENT' });
    assert.equal(await bytes(farm, 'blvTests.json'), before);
  });
});

test('BLV reads retain stable persisted revisions and leave every byte unchanged', async () => {
  const farm = 'blv-read-stable-fixture';
  await runWithFarm(farm, async () => {
    const record = { ...input, cloudUpdatedAt: laterTime };
    const fallback = { ...input, id: 'blv:persisted-time' };
    await writeJson('blv-tests-sync.json', [record, fallback]);
    const before = await bytes(farm);
    assert.deepEqual(await listSyncedBlvTests(), [record, { ...fallback, cloudUpdatedAt: firstTime }]);
    assert.deepEqual(await findSyncedBlvTest(input.id), record);
    assert.deepEqual(await findSyncedBlvTest(fallback.id), { ...fallback, cloudUpdatedAt: firstTime });
    assert.equal(await bytes(farm), before);
  });
});

test('BLV requires conditions before mutation and rejects stale edits independently of device clocks', async () => {
  const farm = 'blv-required-conditions-fixture';
  await runWithFarm(farm, async () => {
    await assert.rejects(syncBlvTest(input.id, input), /PRECONDITION_REQUIRED/);
    await assert.rejects(deleteSyncedBlvTest(input.id), /PRECONDITION_REQUIRED/);
    await assert.rejects(syncBlvTest(input.id, input, { ifMatch: '*' }), /INVALID_BLV_SYNC_CONDITION/);
    await assert.rejects(bytes(farm), { code: 'ENOENT' });
    const original = await syncBlvTest(input.id, input, conditions);
    const edited = await syncBlvTest(input.id, { ...input, note: 'New edit' }, { ifMatch: original.cloudUpdatedAt });
    const before = await bytes(farm);
    await assert.rejects(syncBlvTest(input.id, { ...input, updatedAt: '2099-01-01T00:00:00.000Z' },
      { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    await assert.rejects(deleteSyncedBlvTest(input.id, { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    await assert.rejects(syncBlvTest(input.id, edited, conditions), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);
  });
});

test('BLV lost ACK preserves revision, unknown fields, exact timestamps and explicit null clearing', async () => {
  const farm = 'blv-exact-ack-fixture';
  await runWithFarm(farm, async () => {
    const original = await syncBlvTest(input.id, input, conditions);
    const request = { ...input, note: 'Committed once', updatedAt: laterTime,
      syncRecordId: 'local-only', syncWarning: 'local-only', cloudSyncPending: true,
      blvSyncOrigin: { ownerId: 'local-only' }, blvSyncAttempt: { local: true } };
    const edited = await syncBlvTest(input.id, request, { ifMatch: original.cloudUpdatedAt });
    const before = await bytes(farm);
    assert.deepEqual(await syncBlvTest(input.id, request, { ifMatch: original.cloudUpdatedAt }), edited);
    // Omission is not an instruction to destroy a known business extension or timestamp.
    assert.deepEqual(await syncBlvTest(input.id, { id: input.id, note: request.note }, { ifMatch: original.cloudUpdatedAt }), edited);
    assert.deepEqual(edited.laboratory, input.laboratory);
    assert.equal(edited.createdAt, firstTime);
    assert.equal(edited.updatedAt, laterTime);
    for (const key of ['syncRecordId', 'syncWarning', 'cloudSyncPending', 'blvSyncOrigin', 'blvSyncAttempt']) {
      assert.equal(key in edited, false);
    }
    for (const change of [{ laboratory: { value: '1.20' } }, { updatedAt: firstTime }, { note: 'different' }]) {
      await assert.rejects(syncBlvTest(input.id, { ...request, ...change }, { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    }
    assert.equal(await bytes(farm), before);
    const cleared = await syncBlvTest(input.id, { id: input.id, laboratory: null, note: null }, { ifMatch: edited.cloudUpdatedAt });
    assert.equal(cleared.laboratory, null);
    assert.equal(cleared.note, '');
    assert.equal(cleared.createdAt, firstTime);
    assert.equal(cleared.updatedAt, laterTime);
  });
});

test('BLV farm lock retains concurrent distinct creations and admits only one competing edit or delete', async () => {
  await runWithFarm('blv-lock-fixture', async () => {
    const records = await Promise.all(['first', 'second'].map(suffix =>
      syncBlvTest(`blv:${suffix}`, { ...input, id: `blv:${suffix}` }, conditions)));
    assert.equal((await listSyncedBlvTests()).length, 2);
    for (const [index, original] of records.entries()) {
      const outcomes = await Promise.allSettled([
        syncBlvTest(original.id, { ...original, note: 'First edit' }, { ifMatch: original.cloudUpdatedAt }),
        index === 0 ? syncBlvTest(original.id, { ...original, note: 'Second edit' }, { ifMatch: original.cloudUpdatedAt })
          : deleteSyncedBlvTest(original.id, { ifMatch: original.cloudUpdatedAt }),
      ]);
      assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1);
    }
  });
});

test('BLV absence deletion and replay preserve the tombstone against late creation or PUT revival', async () => {
  const farm = 'blv-tombstone-fixture';
  await runWithFarm(farm, async () => {
    const deleted = await deleteSyncedBlvTest(input.id, conditions);
    assert.ok(deleted.deletedAt);
    const before = await bytes(farm);
    await assert.rejects(syncBlvTest(input.id, input, conditions), /PRECONDITION_FAILED/);
    await assert.rejects(syncBlvTest(input.id, input, { ifMatch: deleted.cloudUpdatedAt }), /RECORD_DELETED/);
    await assert.rejects(deleteSyncedBlvTest(input.id, conditions), /PRECONDITION_FAILED/);
    for (const deletedAt of [undefined, '', null, false, laterTime]) {
      await assert.rejects(syncBlvTest(input.id, { ...input, deletedAt }, { ifMatch: deleted.cloudUpdatedAt }), /INVALID_BLV_SYNC_INPUT/);
    }
    assert.deepEqual(await deleteSyncedBlvTest(input.id, { ifMatch: firstTime }), deleted);
    assert.deepEqual(await listSyncedBlvTests(), [deleted]);
    assert.equal(await bytes(farm), before);
  });
});

test('BLV server clocks advance monotonically without rewriting missing or older business dates', async context => {
  context.mock.method(Date, 'now', () => Date.parse(laterTime));
  await runWithFarm('blv-clock-fixture', async () => {
    const original = await syncBlvTest(input.id, { id: input.id, note: 'No business dates' }, conditions);
    assert.equal(original.createdAt, undefined);
    assert.equal(original.updatedAt, undefined);
    const edited = await syncBlvTest(input.id, { id: input.id, note: 'Second', updatedAt: firstTime, cloudUpdatedAt: '2099-01-01T00:00:00.000Z' },
      { ifMatch: original.cloudUpdatedAt });
    assert.equal(Date.parse(edited.cloudUpdatedAt!) - Date.parse(original.cloudUpdatedAt!), 1);
    assert.equal(edited.updatedAt, firstTime);
    assert.equal(edited.createdAt, undefined);
    const deleted = await deleteSyncedBlvTest(input.id, { ifMatch: edited.cloudUpdatedAt });
    assert.equal(Date.parse(deleted.cloudUpdatedAt!) - Date.parse(edited.cloudUpdatedAt!), 1);
    assert.equal(deleted.updatedAt, firstTime);
  });
});

test('BLV IDs and locks are scoped to their farm and configured runtime directory', async () => {
  await runWithFarm('blv-isolation-a', () => syncBlvTest(input.id, input, conditions));
  await runWithFarm('blv-isolation-b', () => syncBlvTest(input.id, { ...input, note: 'Farm B' }, conditions));
  const before = await bytes('blv-isolation-a');
  const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-blv-second-root-'));
  try {
    process.env.FARMPRO_DATA_DIR = secondRoot;
    await runWithFarm('blv-isolation-a', async () => {
      assert.deepEqual(await listSyncedBlvTests(), []);
      await syncBlvTest(input.id, { ...input, note: 'Other root' }, conditions);
    });
  } finally {
    process.env.FARMPRO_DATA_DIR = temporaryDataDir;
    await fs.rm(secondRoot, { recursive: true, force: true });
  }
  assert.equal(await bytes('blv-isolation-a'), before);
  assert.equal((await runWithFarm('blv-isolation-b', () => findSyncedBlvTest(input.id)))?.note, 'Farm B');
});
