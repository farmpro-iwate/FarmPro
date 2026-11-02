import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { readJson, writeJson } from './jsonStore';
import { getDashboard } from './dashboardStore';
import { getCsv, getReportSummary } from './reportStore';
import { exportBackup, importBackup } from './backupStore';
import { syncBreeding, type Breeding } from './breedingStore';

const originalDataDir = process.env.FARMPRO_DATA_DIR;
let temporaryDataDir = '';
before(async () => {
  temporaryDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-breeding-consumers-'));
  process.env.FARMPRO_DATA_DIR = temporaryDataDir;
});
after(async () => {
  if (originalDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = originalDataDir;
  if (temporaryDataDir) await fs.rm(temporaryDataDir, { recursive: true, force: true });
});

const firstTime = '2026-11-01T00:00:00.000Z';
const fixture = (id: string) => ({
  id, cowEarTag: `FIXTURE-${id}`, cowName: `Fixture ${id}`, breedingMethod: '種付',
  breedingStatus: '受胎', inseminationDate: '2026-10-01', inseminationCost: '1200',
  expectedCalvingDate: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
  createdAt: firstTime, updatedAt: firstTime, cloudUpdatedAt: firstTime,
  preservedExtension: { source: 'fixture', payment: '銀行振込' },
} as unknown as Breeding & { preservedExtension: object });

async function seed(records: unknown[]) {
  for (const name of ['cattle', 'calves', 'vaccines', 'blvTests', 'schedules', 'treatments',
    'sales', 'expenses', 'feedings', 'feedInventory', 'feedingGuide', 'feedingAlertActions']) {
    await writeJson(`${name}.json`, []);
  }
  await writeJson('settings.json', {});
  await writeJson('breedings.json', records);
}

test('dashboard, report, CSV and backup omit deleted breedings while preserving live raw fields', async () => {
  const farm = 'breeding-consumer-fixture';
  await runWithFarm(farm, async () => {
    const live = fixture('live');
    const deleted = { ...fixture('deleted'), deletedAt: '2026-11-02T00:00:00.000Z' };
    await seed([live, deleted]);
    const file = path.join(temporaryDataDir, 'farms', farm, 'breedings.json');
    const beforeRead = await fs.readFile(file, 'utf8');
    const dashboard = await getDashboard();
    assert.equal(dashboard.counts.breedings, 1);
    assert.deepEqual(dashboard.alerts.nearCalvings.map(row => row.id), ['live']);
    assert.equal((await getReportSummary()).counts.breedings, 1);
    const csv = await getCsv('breedings');
    assert.ok(csv?.includes('FIXTURE-live'));
    assert.ok(!csv?.includes('FIXTURE-deleted'));
    const backup = await exportBackup({ id: farm, name: 'Fixture farm' });
    assert.deepEqual(backup.data.breedings, [live]);
    assert.equal(await fs.readFile(file, 'utf8'), beforeRead);
  });
});

test('explicit backup restore preserves source fields, refreshes revisions and retains removed IDs as deleted', async () => {
  const farm = 'breeding-backup-restore-fixture';
  await runWithFarm(farm, async () => {
    const removed = fixture('removed');
    const deleted = { ...fixture('already-deleted'), deletedAt: '2026-11-02T00:00:00.000Z' };
    await seed([removed, deleted]);
    const backup = await exportBackup({ id: farm, name: 'Fixture farm' });
    const restored = fixture('restored');
    backup.data.breedings = [restored];
    const result = await importBackup(backup, farm);
    assert.equal(result.counts.breedings, 1);
    const stored = await readJson<Breeding & { deletedAt?: string; preservedExtension?: object }>('breedings.json');
    const live = stored.find(row => row.id === restored.id)!;
    assert.ok(live);
    const { cloudUpdatedAt, ...content } = live;
    const { cloudUpdatedAt: _oldRevision, ...original } = restored;
    assert.deepEqual(content, original);
    assert.ok(Date.parse(cloudUpdatedAt!) > Date.parse(firstTime));
    assert.ok(stored.find(row => row.id === removed.id)?.deletedAt);
    assert.deepEqual(stored.find(row => row.id === deleted.id), deleted);
    await assert.rejects(syncBreeding(removed.id, { ...removed, note: 'stale restore-era PUT' }), /DELETED/);
    assert.deepEqual((await exportBackup({ id: farm, name: 'Fixture farm' })).data.breedings, [live]);
  });
});

test('invalid breeding backup IDs are rejected before any other ledger is replaced', async () => {
  const farm = 'breeding-backup-validation-fixture';
  await runWithFarm(farm, async () => {
    await seed([fixture('original')]);
    const backup = await exportBackup({ id: farm, name: 'Fixture farm' });
    backup.data.cattle = [{ id: 987, earTag: 'UNEXPECTED-REPLACEMENT' }] as typeof backup.data.cattle;
    backup.data.breedings = [fixture('duplicate'), fixture('duplicate')];
    const directory = path.join(temporaryDataDir, 'farms', farm);
    const before = await Promise.all(['cattle', 'breedings'].map(name => fs.readFile(path.join(directory, `${name}.json`), 'utf8')));
    await assert.rejects(importBackup(backup, farm));
    const afterImport = await Promise.all(['cattle', 'breedings'].map(name => fs.readFile(path.join(directory, `${name}.json`), 'utf8')));
    assert.deepEqual(afterImport, before);
  });
});
