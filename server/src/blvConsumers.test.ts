import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { writeJson } from './jsonStore';
import { exportBackup, importBackup } from './backupStore';
import { getDashboard } from './dashboardStore';
import { getCsv, getReportSummary } from './reportStore';
import { getCloudSnapshot, saveCloudSnapshot, type CloudSnapshot } from './cloudSnapshotStore';
import { deleteSyncedBlvTest, findSyncedBlvTest, listLiveBlvTests, listSyncedBlvTests, syncBlvTest } from './blvSyncStore';

const previousDataDir = process.env.FARMPRO_DATA_DIR;
let temporaryDataDir = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-blv-consumers-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
});
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

const firstTime = '2026-11-01T00:00:00.000Z';
const fixture = (id: string) => ({
  id, cowEarTag: `BLV-${id}`, cowName: `Fixture ${id}`, testDate: '2026-11-01', result: '陽性',
  nextTestDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
  isolationMemo: '', note: id, createdAt: firstTime, updatedAt: firstTime,
  laboratory: { value: '001.20', unknown: ['fixture', null] },
});
const bytes = (farm: string, name: string) => fs.readFile(path.join(temporaryDataDir, 'farms', farm, name), 'utf8');
async function seed(legacy: unknown[]) {
  for (const name of ['cattle', 'calves', 'breedings', 'vaccines', 'schedules', 'treatments',
    'sales', 'expenses', 'feedings', 'feedInventory', 'feedingGuide', 'feedingAlertActions']) {
    await writeJson(`${name}.json`, []);
  }
  await writeJson('settings.json', {});
  await writeJson('blvTests.json', legacy);
}

test('BLV summaries and CSV merge explicit identities without tombstones or any read-time ledger changes', async () => {
  const farm = 'blv-report-fixture';
  await runWithFarm(farm, async () => {
    const legacy = [1, 2, 3].map(id => ({ ...fixture(`legacy-${id}`), id }));
    await seed(legacy);
    const updated = await syncBlvTest('blv:1', { ...fixture('blv:1'), result: '陰性' }, { ifNoneMatch: '*' });
    const deleted = await deleteSyncedBlvTest('blv:2', { ifNoneMatch: '*' });
    const added = await syncBlvTest('blv:new-uuid', fixture('blv:new-uuid'), { ifNoneMatch: '*' });
    const before = await Promise.all(['blvTests.json', 'blv-tests-sync.json'].map(name => bytes(farm, name)));

    const live = await listLiveBlvTests();
    assert.deepEqual(live.map(row => row.id), [3, updated.id, added.id]);
    assert.equal((await getDashboard()).counts.blvPositive, 2);
    assert.deepEqual((await getDashboard()).alerts.blvDueSoon.map(row => row.id), [updated.id]);
    assert.equal((await getReportSummary()).counts.blvPositive, 2);
    const csv = await getCsv('blv');
    assert.ok(csv?.includes('BLV-legacy-3'));
    assert.ok(csv?.includes('BLV-blv:new-uuid'));
    assert.ok(!csv?.includes('BLV-legacy-1'));
    assert.ok(!csv?.includes('BLV-legacy-2'));
    const backup = await exportBackup({ id: farm, name: 'Fixture farm' });
    assert.deepEqual(backup.data.blvTests, legacy);
    assert.deepEqual(backup.data.blvTestsSync?.find(row => row.id === deleted.id), deleted);
    assert.deepEqual(backup.data.blvTestsSync?.find(row => row.id === added.id)?.laboratory, added.laboratory);
    assert.deepEqual(await Promise.all(['blvTests.json', 'blv-tests-sync.json'].map(name => bytes(farm, name))), before);
  });
});

test('old backups and old or empty cloud snapshots cannot erase synced BLV records or revive tombstones', async () => {
  const farm = 'blv-old-backup-fixture';
  await runWithFarm(farm, async () => {
    await seed([{ ...fixture('legacy'), id: 1 }]);
    const saved = await syncBlvTest('blv:live', fixture('blv:live'), { ifNoneMatch: '*' });
    const deleted = await deleteSyncedBlvTest('blv:deleted', { ifNoneMatch: '*' });
    const before = await bytes(farm, 'blv-tests-sync.json');
    const backup = await exportBackup({ id: farm, name: 'Fixture farm' });
    delete backup.data.blvTestsSync;
    backup.data.blvTests = [];
    await importBackup(backup, farm);
    assert.equal(await bytes(farm, 'blv-tests-sync.json'), before);

    const snapshot: CloudSnapshot = {
      format: 'farmpro-backup', schemaVersion: 4, appVersion: 'blv-fixture', exportedAt: firstTime,
      farm: { id: farm, name: 'Fixture farm' },
      stores: { blvTests: [fixture('blv:deleted')], cattle: [], expenses: [] },
    };
    const old = await saveCloudSnapshot(farm, snapshot, null);
    assert.deepEqual((await getCloudSnapshot(farm))?.snapshot.stores.blvTests, snapshot.stores.blvTests);
    await saveCloudSnapshot(farm, { ...snapshot, stores: { ...snapshot.stores, blvTests: [] } }, old.revision);
    assert.deepEqual((await getCloudSnapshot(farm))?.snapshot.stores.blvTests, []);
    assert.equal(await bytes(farm, 'blv-tests-sync.json'), before);
    assert.deepEqual(await findSyncedBlvTest(deleted.id), deleted);
    assert.deepEqual(await listLiveBlvTests(), [saved]);
    await assert.rejects(syncBlvTest(deleted.id, fixture(deleted.id), { ifMatch: deleted.cloudUpdatedAt }), /RECORD_DELETED/);
  });
});

test('explicit sync backup restore validates first and preserves deletion history while advancing live revisions', async () => {
  const farm = 'blv-restore-fixture';
  await runWithFarm(farm, async () => {
    await seed([]);
    const original = await syncBlvTest('blv:restore', fixture('blv:restore'), { ifNoneMatch: '*' });
    const omitted = await syncBlvTest('blv:omitted', fixture('blv:omitted'), { ifNoneMatch: '*' });
    const deleted = await deleteSyncedBlvTest('blv:deleted', { ifNoneMatch: '*' });
    const backup = await exportBackup({ id: farm, name: 'Fixture farm' });
    const changed = { ...original, note: 'Explicitly restored', laboratory: { value: '0007.00' } };
    backup.data.blvTestsSync = [changed, changed];
    backup.data.cattle = [{ id: 987, earTag: 'MUST-NOT-BE-WRITTEN' }] as typeof backup.data.cattle;
    const before = await Promise.all(['cattle.json', 'blvTests.json', 'blv-tests-sync.json'].map(name => bytes(farm, name)));
    await assert.rejects(importBackup(backup, farm), /INVALID_BLV_SYNC_BACKUP/);
    assert.deepEqual(await Promise.all(['cattle.json', 'blvTests.json', 'blv-tests-sync.json'].map(name => bytes(farm, name))), before);

    backup.data.cattle = [];
    backup.data.blvTestsSync = [changed, fixture(deleted.id)];
    await importBackup(backup, farm);
    const restored = await findSyncedBlvTest(original.id);
    assert(restored);
    const { cloudUpdatedAt: _newRevision, ...restoredContent } = restored;
    const { cloudUpdatedAt: _oldRevision, ...expectedContent } = changed;
    assert.deepEqual(restoredContent, expectedContent);
    assert.ok(Date.parse(restored.cloudUpdatedAt!) > Date.parse(original.cloudUpdatedAt!));
    assert.deepEqual(await findSyncedBlvTest(deleted.id), deleted);
    assert.ok((await findSyncedBlvTest(omitted.id))?.deletedAt);
    assert.equal((await listSyncedBlvTests()).length, 3);
    await assert.rejects(syncBlvTest(omitted.id, fixture(omitted.id), { ifMatch: omitted.cloudUpdatedAt }), /RECORD_DELETED/);
  });
});
