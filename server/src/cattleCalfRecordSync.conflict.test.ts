import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { deleteSyncedCattleRecord, listSyncedCattleRecords, syncCattleRecord, type CattleRecordSyncConditions } from './cattleRecordSyncStore';
import { deleteSyncedCalf, listSyncedCalves, syncCalf } from './calfSyncStore';

const previousDataDir = process.env.FARMPRO_DATA_DIR;
let temporaryDataDir = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-cattle-calf-conflicts-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
});
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

const firstTime = '2026-11-01T00:00:00.000Z';
const oldEditTime = '2026-11-01T01:00:00.000Z';
const latestEditTime = '2026-11-01T02:00:00.000Z';
const cow = {
  id: 'idn:fixture-cow', earTag: 'FIXTURE-COW', identificationNumber: 'fixture-cow',
  name: 'Initial cow', birthday: '2024-01-01', createdAt: firstTime, updatedAt: firstTime,
};
const calf = {
  id: 'manual-calf:fixture-calf', calfNumber: 'FIXTURE-CALF', name: 'Initial calf',
  birthday: '2026-01-01', createdAt: firstTime, updatedAt: firstTime,
};

test('cattle: a late PUT carrying an earlier cloud revision cannot replace the latest edit', async () => {
  await runWithFarm('cattle-late-put-fixture', async () => {
    const original = await syncCattleRecord(cow.id, cow);
    await syncCattleRecord(cow.id, { ...original, name: 'Latest cow edit', updatedAt: latestEditTime });
    const before = await listSyncedCattleRecords();
    const outcome = await syncCattleRecord(cow.id, { ...original, name: 'Late older cow edit', updatedAt: oldEditTime })
      .catch((error: unknown) => error);
    assert.deepEqual(await listSyncedCattleRecords(), before);
    assert.ok(outcome instanceof Error, 'the old revision must be rejected');
  });
});

test('calf: a late PUT carrying an earlier cloud revision cannot replace the latest edit', async () => {
  await runWithFarm('calf-late-put-fixture', async () => {
    const original = await syncCalf(calf.id, calf);
    await syncCalf(calf.id, { ...original, name: 'Latest calf edit', updatedAt: latestEditTime });
    const before = await listSyncedCalves();
    const outcome = await syncCalf(calf.id, { ...original, name: 'Late older calf edit', updatedAt: oldEditTime })
      .catch((error: unknown) => error);
    assert.deepEqual(await listSyncedCalves(), before);
    assert.ok(outcome instanceof Error, 'the old revision must be rejected');
  });
});

test('cattle: a live PUT after confirmed deletion cannot clear the tombstone', async () => {
  await runWithFarm('cattle-deletion-fixture', async () => {
    const original = await syncCattleRecord(cow.id, cow);
    await syncCattleRecord(cow.id, {
      ...original, deletedAt: latestEditTime, updatedAt: latestEditTime,
    });
    const before = await listSyncedCattleRecords();
    const outcome = await syncCattleRecord(cow.id, { ...original, name: 'Late live cow', updatedAt: oldEditTime })
      .catch((error: unknown) => error);
    assert.deepEqual(await listSyncedCattleRecords(), before);
    assert.ok(outcome instanceof Error, 'a deleted sync ID must not be revived');
  });
});

test('calf: a live PUT after confirmed deletion cannot clear the tombstone', async () => {
  await runWithFarm('calf-deletion-fixture', async () => {
    const original = await syncCalf(calf.id, calf);
    await deleteSyncedCalf(calf.id);
    const before = await listSyncedCalves();
    const outcome = await syncCalf(calf.id, { ...original, name: 'Late live calf', updatedAt: oldEditTime })
      .catch((error: unknown) => error);
    assert.deepEqual(await listSyncedCalves(), before);
    assert.ok(outcome instanceof Error, 'a deleted sync ID must not be revived');
  });
});

for (const kind of ['cattle', 'calf'] as const) {
  const fileName = kind === 'cattle' ? 'cattle-record-sync.json' : 'calves-sync.json';
  const sync = (input: object = {}, conditions: CattleRecordSyncConditions = {}) => kind === 'cattle'
    ? syncCattleRecord(cow.id, { ...cow, ...input }, conditions)
    : syncCalf(calf.id, { ...calf, ...input }, conditions);
  const list = kind === 'cattle' ? listSyncedCattleRecords : listSyncedCalves;
  const remove = (conditions: CattleRecordSyncConditions = {}) => kind === 'cattle'
    ? deleteSyncedCattleRecord(cow.id, conditions) : deleteSyncedCalf(calf.id, conditions);
  const bytes = (farm: string) => fs.readFile(path.join(temporaryDataDir, 'farms', farm, fileName), 'utf8');

  test(`${kind}: quoted matching conditions succeed, mismatches preserve bytes, and DELETE is idempotent`, async () => {
    const farm = `${kind}-conditions-fixture`;
    await runWithFarm(farm, async () => {
      const original = await sync({}, { ifNoneMatch: '*' });
      const latest = await sync({ ...original, name: 'Conditional edit', updatedAt: latestEditTime }, {
        ifMatch: `"${original.cloudUpdatedAt}"`,
      });
      const before = await bytes(farm);
      await assert.rejects(sync({ ...original, name: 'Rejected edit', updatedAt: oldEditTime }, {
        ifMatch: original.cloudUpdatedAt,
      }), /PRECONDITION_FAILED/);
      await assert.rejects(remove({ ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
      assert.equal(await bytes(farm), before);

      const deleted = await remove({ ifMatch: `"${latest.cloudUpdatedAt}"` });
      assert.ok(deleted.deletedAt);
      const deletedBytes = await bytes(farm);
      const repeated = await remove({ ifMatch: latest.cloudUpdatedAt });
      assert.equal(repeated.deletedAt, deleted.deletedAt);
      assert.equal(repeated.cloudUpdatedAt, deleted.cloudUpdatedAt);
      assert.equal(await bytes(farm), deletedBytes);
    });
  });

  test(`${kind}: If-None-Match refuses even an identical existing record without writing`, async () => {
    const farm = `${kind}-create-only-fixture`;
    await runWithFarm(farm, async () => {
      // Explicit HTTP conditions take precedence over a copied body clock.
      const original = await sync({ cloudUpdatedAt: firstTime }, { ifNoneMatch: '*' });
      assert.notEqual(original.cloudUpdatedAt, firstTime);
      const before = await bytes(farm);
      await assert.rejects(sync(original, { ifNoneMatch: '*' }), /PRECONDITION_FAILED/);
      assert.equal(await bytes(farm), before);
    });
  });

  test(`${kind}: a lost PUT acknowledgement is replayed without a new revision or local-only metadata`, async () => {
    const farm = `${kind}-lost-ack-fixture`;
    await runWithFarm(farm, async () => {
      const original = await sync();
      const request = {
        ...original, name: 'Committed once', updatedAt: latestEditTime,
        cloudSyncPending: true, syncWarning: 'local message', animalSyncOrigin: { owner: 'local-owner' },
        animalSyncBase: original, animalSyncAttempt: { id: 'local-attempt' },
      };
      const saved = await sync(request, { ifMatch: original.cloudUpdatedAt });
      const before = await bytes(farm);
      const repeated = await sync(request, { ifMatch: original.cloudUpdatedAt });
      assert.equal(repeated.cloudUpdatedAt, saved.cloudUpdatedAt);
      assert.equal(await bytes(farm), before);
      const [received] = await list();
      for (const record of [saved, repeated, received]) {
        for (const key of ['cloudSyncPending', 'syncWarning', 'animalSyncOrigin', 'animalSyncBase', 'animalSyncAttempt']) {
          assert.equal(key in record, false, `${key} must stay on the originating browser`);
        }
      }
      assert.equal(before.includes('local-owner'), false);
    });
  });

  test(`${kind}: separate writes in the same millisecond receive different revisions`, async (context) => {
    context.mock.method(Date, 'now', () => Date.parse('2026-11-01T06:00:00.000Z'));
    await runWithFarm(`${kind}-same-tick-fixture`, async () => {
      const original = await sync();
      const latest = await sync({ ...original, name: 'Same clock edit', updatedAt: latestEditTime }, {
        ifMatch: original.cloudUpdatedAt,
      });
      assert.equal(Date.parse(latest.cloudUpdatedAt!) - Date.parse(original.cloudUpdatedAt!), 1);
      await assert.rejects(sync({ ...original, name: 'Competing edit', updatedAt: latestEditTime }, {
        ifMatch: original.cloudUpdatedAt,
      }), /PRECONDITION_FAILED/);
    });
  });

  test(`${kind}: only one concurrent different edit can consume a revision`, async () => {
    await runWithFarm(`${kind}-concurrent-fixture`, async () => {
      const original = await sync();
      const outcomes = await Promise.allSettled([
        sync({ ...original, name: 'First edit', updatedAt: latestEditTime }, { ifMatch: original.cloudUpdatedAt }),
        sync({ ...original, name: 'Second edit', updatedAt: latestEditTime }, { ifMatch: original.cloudUpdatedAt }),
      ]);
      assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
      assert.equal((await list()).length, 1);
    });
  });

  test(`${kind}: deleting an unknown ID prevents a delayed unconditional creation, without changing another farm`, async () => {
    const sourceFarm = `${kind}-delete-unknown-fixture`;
    const otherFarm = `${kind}-untouched-fixture`;
    await runWithFarm(otherFarm, () => sync({ name: 'Other farm record' }));
    const otherBefore = await bytes(otherFarm);
    await runWithFarm(sourceFarm, async () => {
      await assert.rejects(remove({ ifMatch: 'missing-revision' }), /PRECONDITION_FAILED/);
      assert.deepEqual(await list(), []);
      const deleted = await remove();
      const before = await bytes(sourceFarm);
      await assert.rejects(sync({ updatedAt: latestEditTime, cloudUpdatedAt: deleted.cloudUpdatedAt }), /RECORD_DELETED/);
      assert.equal(await bytes(sourceFarm), before);
    });
    assert.equal(await bytes(otherFarm), otherBefore);
  });
}
