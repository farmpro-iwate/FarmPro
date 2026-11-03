import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { writeJson } from './jsonStore';
import { exportBackup, importBackup } from './backupStore';
import { getCloudSnapshot, saveCloudSnapshot, type CloudSnapshot } from './cloudSnapshotStore';
import { deleteSyncedManagementRecord, findSyncedManagementRecord, listLiveFeedingAlertActions,
  listSyncedManagementRecords, syncManagementRecord, type ManagementSyncResource } from './managementRecordSyncStore';

const previousCwd = process.cwd();
const previousDataDir = process.env.FARMPRO_DATA_DIR;
let root = '';
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-management-consumers-'));
  process.chdir(root);
  process.env.FARMPRO_DATA_DIR = path.join(root, 'runtime');
  await fs.mkdir(path.join(root, 'src', 'data'), { recursive: true });
  await fs.mkdir(path.join(root, 'runtime'), { recursive: true });
  for (const name of ['src/data/feedingAlertActions.json', 'runtime/feedingAlertActions.json']) {
    await fs.writeFile(path.join(root, name), JSON.stringify([{ id: 'GLOBAL-FIXTURE-MUST-NOT-MIGRATE', status: '未対応' }]));
  }
});
after(async () => {
  process.chdir(previousCwd);
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (root) await fs.rm(root, { recursive: true, force: true });
});
const firstTime = '2026-11-01T00:00:00.000Z';
const resources: ManagementSyncResource[] = ['feedingAlertActions', 'fatteningTransitions', 'activityRecords'];
const fileNames = { feedingAlertActions: 'feeding-alert-actions-sync.json', fatteningTransitions: 'fattening-transitions-sync.json', activityRecords: 'activity-records-sync.json' };
const backupKeys = { feedingAlertActions: 'feedingAlertActionsSync', fatteningTransitions: 'fatteningTransitionsSync', activityRecords: 'activityRecordsSync' } as const;
const fixture = (id: string) => ({ id, activityType: 'farm', recordDate: '2026-11-03', title: 'Fixture work', note: '',
  animalKind: '', animalId: '', animalSyncId: '', animalIdentificationNumber: '', animalEarTag: '', animalName: '', animalBirthday: '',
  targetNumber: `FIXTURE-${id}`, memo: id, status: '未対応',
  createdAt: firstTime, updatedAt: firstTime, extension: { amount: '001.20', values: [null, '', 'fixture'] } });
const bytes = (farm: string, name: string) => fs.readFile(path.join(root, 'runtime', 'farms', farm, name), 'utf8');
async function seed(withFarmActions = true) {
  for (const name of ['cattle', 'calves', 'breedings', 'vaccines', 'blvTests', 'schedules', 'treatments',
    'sales', 'expenses', 'feedings', 'feedInventory', 'feedingGuide']) await writeJson(`${name}.json`, []);
  await writeJson('settings.json', {});
  if (withFarmActions) await writeJson('feedingAlertActions.json', []);
}

test('demo-farm reports and backup never adopt either global feeding-action file or create empty sync ledgers', async () => {
  const farm = 'farm-demo';
  const globalFiles = ['src/data/feedingAlertActions.json', 'runtime/feedingAlertActions.json'].map(name => path.join(root, name));
  const globalBefore = await Promise.all(globalFiles.map(name => fs.readFile(name, 'utf8')));
  await runWithFarm(farm, async () => {
    await seed(false);
    assert.deepEqual(await listLiveFeedingAlertActions(), []);
    const backup = await exportBackup({ id: farm, name: 'Fixture farm' });
    assert.deepEqual(backup.data.feedingAlertActions, []);
    assert.deepEqual(backup.data.feedingAlertActionsSync, []);
    assert.deepEqual(backup.data.fatteningTransitionsSync, []);
    for (const name of ['feedingAlertActions.json', ...Object.values(fileNames)]) {
      await assert.rejects(bytes(farm, name), { code: 'ENOENT' });
    }
  });
  assert.deepEqual(await Promise.all(globalFiles.map(name => fs.readFile(name, 'utf8'))), globalBefore);
});

test('old backups and old or empty snapshots leave both management sync ledgers and their tombstones untouched', async () => {
  const farm = 'management-old-backup-fixture';
  await runWithFarm(farm, async () => {
    await seed();
    for (const resource of resources) {
      await syncManagementRecord(resource, 'live', fixture('live'), { ifNoneMatch: '*' });
      await deleteSyncedManagementRecord(resource, 'deleted', { ifNoneMatch: '*' });
    }
    const before = await Promise.all(resources.map(resource => bytes(farm, fileNames[resource])));
    const backup = await exportBackup({ id: farm, name: 'Fixture farm' });
    for (const resource of resources) {
      const rows = backup.data[backupKeys[resource]]!;
      assert.equal(rows.length, 2);
      assert.deepEqual(rows.find(record => record.id === 'live')?.extension, fixture('live').extension);
      assert.ok(rows.find(record => record.id === 'deleted')?.deletedAt);
      delete backup.data[backupKeys[resource]];
    }
    await importBackup(backup, farm);
    assert.deepEqual(await Promise.all(resources.map(resource => bytes(farm, fileNames[resource]))), before);
    const snapshot: CloudSnapshot = { format: 'farmpro-backup', schemaVersion: 4, appVersion: 'management-fixture',
      exportedAt: firstTime, farm: { id: farm, name: 'Fixture farm' },
      stores: { feedingAlertActions: [fixture('deleted')], fatteningTransitions: [fixture('deleted')], cattle: [], expenses: [] } };
    const saved = await saveCloudSnapshot(farm, snapshot, null);
    assert.deepEqual((await getCloudSnapshot(farm))?.snapshot.stores, snapshot.stores);
    await saveCloudSnapshot(farm, { ...snapshot, stores: { ...snapshot.stores, feedingAlertActions: [], fatteningTransitions: [] } }, saved.revision);
    assert.deepEqual(await Promise.all(resources.map(resource => bytes(farm, fileNames[resource]))), before);
    for (const resource of resources) {
      const tombstone = await findSyncedManagementRecord(resource, 'deleted');
      assert.ok(tombstone?.deletedAt);
      await assert.rejects(syncManagementRecord(resource, 'deleted', fixture('deleted'), { ifMatch: tombstone.cloudUpdatedAt }), /RECORD_DELETED/);
    }
  });
});

test('explicit management restore validates before all writes, advances live revisions and cannot revive prior deletions', async () => {
  const farm = 'management-restore-fixture';
  await runWithFarm(farm, async () => {
    await seed();
    for (const resource of resources) {
      await syncManagementRecord(resource, 'live', fixture('live'), { ifNoneMatch: '*' });
      await syncManagementRecord(resource, 'omitted', fixture('omitted'), { ifNoneMatch: '*' });
      await deleteSyncedManagementRecord(resource, 'deleted', { ifNoneMatch: '*' });
    }
    const backup = await exportBackup({ id: farm, name: 'Fixture farm' });
    const originals = Object.fromEntries(await Promise.all(resources.map(async resource => [resource, await listSyncedManagementRecords(resource)])));
    const protectedNames = ['cattle.json', 'expenses.json', 'feedingAlertActions.json', ...Object.values(fileNames)];
    const before = await Promise.all(protectedNames.map(name => bytes(farm, name)));
    for (const resource of resources) {
      const key = backupKeys[resource];
      const saved = backup.data[key];
      backup.data[key] = [fixture('duplicate'), fixture('duplicate')];
      backup.data.cattle = [{ id: 987, earTag: 'MUST-NOT-WRITE' }] as typeof backup.data.cattle;
      await assert.rejects(importBackup(backup, farm), /INVALID_MANAGEMENT_SYNC_BACKUP/);
      assert.deepEqual(await Promise.all(protectedNames.map(name => bytes(farm, name))), before);
      backup.data[key] = saved;
    }
    backup.data.cattle = [];
    for (const resource of resources) backup.data[backupKeys[resource]] = [
      { ...fixture('live'), memo: null, updatedAt: null, extension: { amount: '0007.50' } }, fixture('deleted'),
    ];
    await importBackup(backup, farm);
    for (const resource of resources) {
      const live = await findSyncedManagementRecord(resource, 'live');
      assert.equal(live?.memo, null); assert.equal(live?.updatedAt, null);
      assert.deepEqual(live?.extension, { amount: '0007.50' });
      assert.ok(Date.parse(live!.cloudUpdatedAt!) > Date.parse(originals[resource].find((row: { id: string }) => row.id === 'live')!.cloudUpdatedAt!));
      assert.deepEqual(await findSyncedManagementRecord(resource, 'deleted'), originals[resource].find((row: { id: string }) => row.id === 'deleted'));
      assert.ok((await findSyncedManagementRecord(resource, 'omitted'))?.deletedAt);
      assert.equal((await listSyncedManagementRecords(resource)).length, 3);
    }
    assert.deepEqual(await Promise.all(['cattle.json', 'expenses.json', 'feedingAlertActions.json'].map(name => bytes(farm, name))), before.slice(0, 3));
  });
});
