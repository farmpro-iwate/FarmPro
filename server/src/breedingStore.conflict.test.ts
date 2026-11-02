import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { readJson, writeJson } from './jsonStore';
import * as store from './breedingStore';
import type { Breeding, BreedingSyncInput } from './breedingStore';

const previousDataDir = process.env.FARMPRO_DATA_DIR;
let temporaryDataDir = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-breeding-conflicts-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
});
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

const firstTime = '2026-11-02T00:00:00.000Z';
const laterTime = '2026-11-02T01:00:00.000Z';
const input = (changes: Partial<BreedingSyncInput> = {}): BreedingSyncInput => ({
  cowEarTag: 'FIXTURE-COW', cowName: 'Fixture cow', breedingMethod: '種付',
  breedingStatus: '種付実施', inseminationDate: '2026-11-02', inseminationCost: '1200',
  note: 'Original breeding', createdAt: firstTime, updatedAt: firstTime, ...changes,
} as BreedingSyncInput);
const bytes = (farm: string) => fs.readFile(path.join(temporaryDataDir, 'farms', farm, 'breedings.json'), 'utf8');
const conditionalSync = store.syncBreeding as (
  id: string | number, value: BreedingSyncInput, conditions: { ifMatch?: string; ifNoneMatch?: string },
) => Promise<Breeding>;
const conditionalDelete = store.deleteBreeding as (
  id: string | number, conditions: { ifMatch?: string; ifNoneMatch?: string },
) => Promise<boolean>;

test('a stale conditional edit or deletion cannot replace a newer breeding even with a later client clock', async () => {
  const farm = 'breeding-stale-fixture';
  await runWithFarm(farm, async () => {
    const original = await store.syncBreeding('fixture-breeding', input());
    await conditionalSync(original.id, input({ note: 'Newer cloud edit', updatedAt: laterTime }), { ifMatch: original.cloudUpdatedAt });
    const before = await bytes(farm);
    await assert.rejects(conditionalSync(original.id, input({ note: 'Old screen', updatedAt: '2099-01-01T00:00:00.000Z' }),
      { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    await assert.rejects(conditionalDelete(original.id, { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);
  });
});

test('concurrent different edits cannot both consume the same breeding revision', async () => {
  await runWithFarm('breeding-concurrent-fixture', async () => {
    const original = await store.syncBreeding('fixture-breeding', input());
    const outcomes = await Promise.allSettled([
      conditionalSync(original.id, input({ note: 'First edit', updatedAt: laterTime }), { ifMatch: original.cloudUpdatedAt }),
      conditionalSync(original.id, input({ note: 'Second edit', updatedAt: laterTime }), { ifMatch: original.cloudUpdatedAt }),
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await store.listBreedings()).length, 1);
  });
});

test('a delayed legacy PUT cannot recreate a breeding after successful deletion', async () => {
  const farm = 'breeding-delete-late-put-fixture';
  await runWithFarm(farm, async () => {
    const original = await store.syncBreeding('fixture-breeding', input());
    assert.equal(await store.deleteBreeding(original.id), true);
    const before = await bytes(farm);
    await assert.rejects(store.syncBreeding(original.id, input({ note: 'Late old edit', updatedAt: laterTime })), /RECORD_DELETED/);
    assert.equal(await bytes(farm), before);
    assert.deepEqual(await store.listBreedings(), []);
  });
});

test('reads preserve stored revisions, unknown raw fields and bytes while excluding deletion history', async () => {
  const farm = 'breeding-read-fixture';
  await runWithFarm(farm, async () => {
    const raw = { ...input(), id: 7, unknownBusiness: { amount: '123.40' }, cloudSyncPending: true };
    await writeJson('breedings.json', [raw, { ...input(), id: 'deleted', deletedAt: laterTime }]);
    const before = await bytes(farm);
    const live = await store.listBreedings();
    assert.equal(live.length, 1);
    assert.equal(live[0].id, 7);
    assert.equal(live[0].cloudUpdatedAt, firstTime);
    assert.deepEqual(await store.findSyncedBreeding('7'), live[0]);
    assert.deepEqual(await store.listStoredBreedings(), [raw]);
    assert.equal('cloudSyncPending' in live[0], false);
    assert.equal('unknownBusiness' in live[0], false);
    assert.equal(await store.findBreeding('deleted'), undefined);
    assert.equal((await store.findSyncedBreeding('deleted'))?.deletedAt, laterTime);
    assert.equal(await bytes(farm), before);
    const changed = await conditionalSync('7', input({ note: 'Edited legacy clock row' }), { ifMatch: firstTime });
    assert.equal(changed.id, 7);
    assert.notEqual(changed.cloudUpdatedAt, firstTime);
  });
});

test('parallel creations of different IDs and legacy numeric creation keep every row', async () => {
  await runWithFarm('breeding-distinct-create-fixture', async () => {
    await Promise.all([
      conditionalSync('fixture-a', input(), { ifNoneMatch: '*' }),
      conditionalSync('fixture-b', input({ cowEarTag: 'SECOND-COW' }), { ifNoneMatch: '*' }),
      store.createBreeding(input({ cowEarTag: 'THIRD-COW' })),
    ]);
    const rows = await store.listBreedings();
    assert.equal(rows.length, 3);
    assert.deepEqual(new Set(rows.map(row => row.cowEarTag)), new Set(['FIXTURE-COW', 'SECOND-COW', 'THIRD-COW']));
    assert.equal(rows.filter(row => typeof row.id === 'number').length, 1);
  });
});

test('a conditional edit racing a deletion consumes the original revision only once', async () => {
  await runWithFarm('breeding-delete-edit-fixture', async () => {
    const original = await store.syncBreeding('fixture-breeding', input());
    const outcomes = await Promise.allSettled([
      conditionalSync(original.id, input({ note: 'Edited in race', updatedAt: laterTime }), { ifMatch: original.cloudUpdatedAt }),
      conditionalDelete(original.id, { ifMatch: original.cloudUpdatedAt }),
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
    const current = await store.findSyncedBreeding(original.id);
    assert(current);
    if (outcomes[0].status === 'fulfilled') {
      assert.equal(current.note, 'Edited in race');
      assert.equal(current.deletedAt, undefined);
    } else {
      assert.ok(current.deletedAt);
      assert.deepEqual(await store.listBreedings(), []);
    }
  });
});

test('lost PUT acknowledgement replays exact normalized content without advancing revision or copying local metadata', async () => {
  const farm = 'breeding-replay-fixture';
  await runWithFarm(farm, async () => {
    const original = await conditionalSync('fixture-breeding', input(), { ifNoneMatch: '*' });
    const request = { ...input({ note: 'Committed once', updatedAt: laterTime }),
      cloudSyncPending: true, breedingSyncBase: { private: 'fixture-browser' },
      breedingSyncDeletePending: false, cloudRecordId: 'local-alias', recordKind: 'standard',
    };
    const saved = await conditionalSync(original.id, request, { ifMatch: `"${original.cloudUpdatedAt}"` });
    const before = await bytes(farm);
    const repeated = await conditionalSync(original.id, request, { ifMatch: original.cloudUpdatedAt });
    assert.equal(repeated.cloudUpdatedAt, saved.cloudUpdatedAt);
    assert.equal(await bytes(farm), before);
    for (const key of ['cloudSyncPending', 'breedingSyncBase', 'breedingSyncDeletePending', 'cloudRecordId', 'recordKind']) {
      assert.equal(key in repeated, false);
      assert.equal(key in (await readJson<Breeding>('breedings.json'))[0], false);
    }
    await assert.rejects(conditionalSync(original.id, { ...request, inseminationCost: '01200' },
      { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);
  });
});

test('create-only rejects both existing live and deleted IDs, including identical content', async () => {
  const farm = 'breeding-create-only-fixture';
  await runWithFarm(farm, async () => {
    const original = await conditionalSync('fixture-breeding', input(), { ifNoneMatch: '*' });
    const before = await bytes(farm);
    await assert.rejects(conditionalSync(original.id, original, { ifNoneMatch: '*' }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);
    await conditionalDelete(original.id, { ifMatch: original.cloudUpdatedAt });
    const deleted = await bytes(farm);
    await assert.rejects(conditionalSync(original.id, input(), { ifNoneMatch: '*' }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), deleted);
  });
});

test('deleted rows retain a stable tombstone and legacy numeric allocation never reuses them', async () => {
  const farm = 'breeding-delete-replay-fixture';
  await runWithFarm(farm, async () => {
    const original = await store.createBreeding(input());
    assert.equal(typeof original.id, 'number');
    await conditionalDelete(original.id, { ifMatch: original.cloudUpdatedAt });
    const before = await bytes(farm);
    const tombstone = await store.findSyncedBreeding(original.id);
    assert.ok(tombstone?.deletedAt);
    assert.equal(await conditionalDelete(original.id, { ifMatch: original.cloudUpdatedAt }), true);
    assert.equal(await conditionalDelete(original.id, { ifNoneMatch: '*' }), true);
    assert.equal(await bytes(farm), before);
    const next = await store.createBreeding(input({ cowEarTag: 'SECOND-COW' }));
    assert.ok(Number(next.id) > Number(original.id));
    await assert.rejects(store.updateBreeding(original.id, input()), /RECORD_DELETED/);
  });
});

test('conditional absence deletion stops delayed creation but cannot delete a concurrent new row', async () => {
  const farm = 'breeding-absence-fixture';
  const otherFarm = 'breeding-other-farm-fixture';
  await runWithFarm(otherFarm, () => store.syncBreeding('fixture-absent', input({ note: 'Other farm' })));
  const otherBefore = await bytes(otherFarm);
  await runWithFarm(farm, async () => {
    assert.equal(await store.deleteBreeding('fixture-legacy-missing'), false);
    assert.equal(await store.findSyncedBreeding('fixture-legacy-missing'), undefined);
    assert.equal(await conditionalDelete('fixture-absent', { ifNoneMatch: '*' }), true);
    await assert.rejects(store.syncBreeding('fixture-absent', input()), /RECORD_DELETED/);
    const original = await conditionalSync('fixture-concurrent', input(), { ifNoneMatch: '*' });
    const before = await bytes(farm);
    await assert.rejects(conditionalDelete(original.id, { ifNoneMatch: '*' }), /PRECONDITION_FAILED/);
    assert.equal(await bytes(farm), before);
  });
  assert.equal(await bytes(otherFarm), otherBefore);
});

test('same-clock writes receive increasing revisions and conditional edits tolerate a slower device clock', async context => {
  context.mock.method(Date, 'now', () => Date.parse(firstTime));
  await runWithFarm('breeding-monotonic-fixture', async () => {
    const original = await conditionalSync('fixture-breeding', input({ updatedAt: '2099-01-01T00:00:00.000Z' }), { ifNoneMatch: '*' });
    const changed = await conditionalSync(original.id, input({ note: 'Slower device', updatedAt: laterTime }), { ifMatch: original.cloudUpdatedAt });
    assert.equal(Date.parse(changed.cloudUpdatedAt!) - Date.parse(original.cloudUpdatedAt!), 1);
    await assert.rejects(conditionalSync(original.id, input({ note: 'Stale same-clock edit' }),
      { ifMatch: original.cloudUpdatedAt }), /PRECONDITION_FAILED/);
    await assert.rejects(store.syncBreeding(original.id, input({ note: 'Legacy older timestamp', updatedAt: firstTime })), /SYNC_CONFLICT/);
    const legacy = await store.syncBreeding(original.id, input({ note: 'Legacy later timestamp', updatedAt: '2099-01-01T01:00:00.000Z' }));
    assert.equal(legacy.note, 'Legacy later timestamp');
  });
});

test('invalid preconditions, missing revisions and body deletion flags cannot change stored records', async () => {
  const farm = 'breeding-invalid-fixture';
  await runWithFarm(farm, async () => {
    const original = await store.syncBreeding('fixture-breeding', input());
    const before = await bytes(farm);
    for (const conditions of [
      { ifMatch: '*' }, { ifMatch: '' }, { ifMatch: 'W/"revision"' },
      { ifNoneMatch: 'other' }, { ifMatch: original.cloudUpdatedAt, ifNoneMatch: '*' },
    ]) {
      await assert.rejects(conditionalSync(original.id, input({ note: 'Rejected' }), conditions), /INVALID_BREEDING_SYNC_CONDITION/);
      await assert.rejects(conditionalDelete(original.id, conditions), /INVALID_BREEDING_SYNC_CONDITION/);
    }
    await assert.rejects(conditionalSync('missing', input(), { ifMatch: 'missing-revision' }), /PRECONDITION_FAILED/);
    await assert.rejects(conditionalDelete('missing', { ifMatch: 'missing-revision' }), /PRECONDITION_FAILED/);
    for (const deletedAt of [laterTime, '', null, false]) {
      const malformed = { ...input(), deletedAt } as unknown as BreedingSyncInput;
      await assert.rejects(store.syncBreeding(original.id, malformed), /INVALID_BREEDING_SYNC_INPUT/);
      await assert.rejects(store.createBreeding(malformed), /INVALID_BREEDING_SYNC_INPUT/);
      await assert.rejects(store.updateBreeding(original.id, malformed), /INVALID_BREEDING_SYNC_INPUT/);
    }
    assert.equal(await bytes(farm), before);
  });
});

test('backup validation accepts valid tombstones and rejects ambiguous IDs and nonempty invalid deletion values', () => {
  store.validateBreedingBackupRecords([{ ...input(), id: 1, deletedAt: laterTime }, { ...input(), id: 'other', deletedAt: '' }]);
  for (const invalid of [
    null, [null], [{ id: '' }], [{ id: Number.NaN }], [{ id: 1 }, { id: '1' }],
    [{ id: 'bad', deletedAt: 'not-a-date' }], [{ id: 'bad', deletedAt: '1' }], [{ id: 'bad', deletedAt: true }],
  ]) assert.throws(() => store.validateBreedingBackupRecords(invalid), /INVALID_BACKUP_BREEDINGS/);
});
