import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from './farmContext';
import { isBreedingLifecycleSchedule, isLifecycleAlertSuppressed, mergeLifecycleAnimalRows, readLifecycleAlertLedger } from './animalLifecycleAlerts';
import { collectFarmAlerts } from './automaticPushAlerts';

const asOf = '2026-11-03';
const death = { version: 1, death: { date: '2026-11-02', reason: '病死', note: '', recordedAt: '2026-11-02T03:00:00Z' } };
const culling = { version: 1, culling: { date: '2026-11-01', reason: '繁殖終了', note: '', route: 'fattening', recordedAt: '2026-11-01T03:00:00Z' } };
const animal = { id: 'cow-a', earTag: '0123', identificationNumber: '0123456789', name: '同名', birthday: '2021-01-01' };
const beforeTime = '2026-11-01T00:00:00Z';
const afterTime = '2026-11-03T00:00:00Z';

test('latest individual death wins over a stale living snapshot without mutating either source', () => {
  const snapshot = [{ ...animal, id: 7, syncId: animal.id, updatedAt: beforeTime }];
  const synced = [{ ...animal, lifecycle: death, cloudUpdatedAt: afterTime }];
  const before = JSON.stringify({ snapshot, synced });
  const cattle = mergeLifecycleAnimalRows(snapshot, synced);
  assert.equal(cattle.length, 1);
  assert.deepEqual(cattle[0].lifecycle, death);
  assert.equal(isLifecycleAlertSuppressed({ targetNumber: '0123' }, { cattle, calves: [] }, { asOf }), true);
  assert.equal(JSON.stringify({ snapshot, synced }), before);
});

test('an old ledger row without metadata cannot erase snapshot death and preserves both lifecycle events', () => {
  const snapshot = [{ ...animal, id: 7, syncId: animal.id, lifecycle: death, updatedAt: afterTime }];
  const older = [{ ...animal, updatedAt: beforeTime }];
  const merged = mergeLifecycleAnimalRows(snapshot, older);
  assert.deepEqual(merged[0].lifecycle, death);
  const combined = mergeLifecycleAnimalRows([{ ...snapshot[0], lifecycle: culling }], [{ ...animal, lifecycle: death, cloudUpdatedAt: afterTime }]);
  assert.deepEqual(combined[0].lifecycle, { ...culling, ...death });
  // Metadata-free legacy writes also cannot reactivate a previously recorded death.
  assert.deepEqual(mergeLifecycleAnimalRows(snapshot, [{ ...animal, cloudUpdatedAt: '2026-11-04T00:00:00Z' }])[0].lifecycle, death);
});

test('newer event corrections use the row revision even when recordedAt is unchanged', () => {
  const corrected = { ...death, death: { ...death.death, reason: '確認後の理由', date: '2026-11-01' } };
  const cattle = mergeLifecycleAnimalRows([{ ...animal, syncId: animal.id, lifecycle: death, updatedAt: beforeTime }],
    [{ ...animal, lifecycle: corrected, cloudUpdatedAt: afterTime }]);
  assert.deepEqual(cattle[0].lifecycle, corrected);
});

test('stable identity and full identification match across devices; numeric ids, names and conflicts do not', () => {
  const snapshot = [{ ...animal, id: 42, lifecycle: death, updatedAt: afterTime }];
  const sameAnimal = mergeLifecycleAnimalRows(snapshot, [{ ...animal, id: 'idn:0123456789' }]);
  assert.equal(sameAnimal.length, 1);
  assert.equal(isLifecycleAlertSuppressed({ targetNumber: '0123' }, { cattle: sameAnimal, calves: [] }, { asOf }), true);
  assert.equal(isLifecycleAlertSuppressed({ cattleId: 'idn:0123456789' }, { cattle: sameAnimal, calves: [] }, { asOf }), true);
  const unrelated = mergeLifecycleAnimalRows([{ id: 42, earTag: '0123', name: '同名', lifecycle: death }],
    [{ id: 'legacy:42', legacyId: 42, earTag: '9999', name: '同名' }]);
  assert.equal(unrelated.length, 2);
  assert.equal(isLifecycleAlertSuppressed({ cattleId: 42 }, { cattle: unrelated, calves: [] }, { asOf }), false);
  assert.equal(isLifecycleAlertSuppressed({ targetName: '同名' }, { cattle: unrelated, calves: [] }, { asOf }), false);
  assert.equal(isLifecycleAlertSuppressed({ targetNumber: '9999' }, { cattle: unrelated, calves: [] }, { asOf }), false);
  const conflict = mergeLifecycleAnimalRows([{ ...animal, syncId: animal.id, lifecycle: death }], [{ ...animal, earTag: '9999' }]);
  assert.equal(conflict.length, 2);
  assert.equal(isLifecycleAlertSuppressed({ targetNumber: '0123' }, { cattle: conflict, calves: [] }, { asOf }), false);
});

test('same-kind duplicates and calf/cattle number collisions never hide another animal alert', () => {
  const cattle = [{ ...animal, lifecycle: death }, { id: 'cow-other', earTag: '0123', name: 'other' }];
  assert.equal(isLifecycleAlertSuppressed({ targetNumber: '0123' }, { cattle, calves: [] }, { asOf }), false);
  const ledger = { cattle: cattle.slice(0, 1), calves: [{ id: 'calf-a', calfNumber: '0123' }] };
  assert.equal(isLifecycleAlertSuppressed({ targetNumber: '0123' }, ledger, { asOf }), false);
  assert.equal(isLifecycleAlertSuppressed({ targetType: '子牛', targetNumber: '0123' }, ledger, { asOf }), false);
  assert.equal(isLifecycleAlertSuppressed({ targetType: '成牛', targetNumber: '0123' }, ledger, { asOf }), true);
  assert.equal(isLifecycleAlertSuppressed({ targetNumber: '123' }, ledger, { asOf }), false);
});

test('culling suppresses breeding only and legacy calf death still ends care reminders', () => {
  const ledger = { cattle: [{ ...animal, lifecycle: culling }], calves: [{ id: 'calf-a', calfNumber: 'TEMP-a', managementStatus: '死亡・その他' }] };
  const row = { targetType: '成牛', targetNumber: '0123' };
  assert.equal(isLifecycleAlertSuppressed(row, ledger, { asOf, breeding: true }), true);
  assert.equal(isLifecycleAlertSuppressed(row, ledger, { asOf }), false);
  assert.equal(isLifecycleAlertSuppressed({ targetNumber: 'TEMP-a' }, ledger, { asOf }), true);
  assert.equal(isLifecycleAlertSuppressed({ targetNumber: '仮-1102' }, ledger, { asOf }), false);
  assert.equal(isLifecycleAlertSuppressed(row, ledger, { asOf: '2026-10-31', breeding: true }), false);
  assert.equal(isBreedingLifecycleSchedule({ title: '人工授精', scheduleType: 'その他' }), true);
  assert.equal(isBreedingLifecycleSchedule({ title: '給餌', note: '繁殖終了' }), false);
});

test('a formal synced tombstone cannot be revived by a snapshot', () => {
  const cattle = mergeLifecycleAnimalRows([{ ...animal, syncId: animal.id, lifecycle: death, updatedAt: afterTime }],
    [{ id: animal.id, deletedAt: beforeTime }]);
  assert.equal(cattle.length, 1);
  assert.equal(cattle[0].deletedAt, beforeTime);
});

const previousDataDir = process.env.FARMPRO_DATA_DIR;
let root = '';
before(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-lifecycle-alerts-')); process.env.FARMPRO_DATA_DIR = root; });
after(async () => {
  if (previousDataDir === undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR = previousDataDir;
  if (root) await fs.rm(root, { recursive: true, force: true });
});
async function saveFixture(farm: string, name: string, value: unknown) {
  const directory = path.join(root, 'farms', farm);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, name), JSON.stringify(value));
}
const snapshot = (farm: string, cattle: unknown[], calves: unknown[] = []) => ({
  savedAt: afterTime, revision: 1, snapshot: { format: 'farmpro-backup', schemaVersion: 5, exportedAt: afterTime,
    farm: { id: farm, name: 'Fixture' }, stores: { cattle, calves } },
});

test('farm lifecycle reads use only exact farm files, never global fallback or empty ledger writes', async () => {
  const globalFile = path.join(root, 'cattle-record-sync.json');
  await fs.writeFile(globalFile, JSON.stringify([{ ...animal, lifecycle: death }]));
  const globalBefore = await fs.readFile(globalFile, 'utf8');
  assert.deepEqual(await runWithFarm('farm-demo', readLifecycleAlertLedger), { cattle: [], calves: [] });
  await assert.rejects(fs.stat(path.join(root, 'farms', 'farm-demo')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(globalFile, 'utf8'), globalBefore);
  await assert.rejects(readLifecycleAlertLedger(), /MISSING_LIFECYCLE_ALERT_FARM/);
});

test('withdrawn farm metadata cannot be read and the withdrawal guard remains read only', async () => {
  const farm = 'withdrawn-fixture';
  await saveFixture(farm, 'cattle-record-sync.json', [{ ...animal, lifecycle: death }]);
  const file = path.join(root, 'account-withdrawals.json');
  const saved = { version: 1, operations: [{ id: 'withdrawal-fixture', userId: 'user-fixture', actorId: 'actor-fixture',
    farmId: farm, status: 'completed', startedAt: beforeTime, completedAt: afterTime }] };
  await fs.writeFile(file, JSON.stringify(saved));
  const before = await fs.readFile(file, 'utf8');
  try {
    await assert.rejects(runWithFarm(farm, readLifecycleAlertLedger), /FARM_WITHDRAWN/);
    assert.equal(await fs.readFile(file, 'utf8'), before);
  } finally { await fs.unlink(file); }
});

test('farm-scoped snapshot and individual sync are read together without rewriting files', async () => {
  const farm = 'farm-lifecycle-reader';
  await saveFixture(farm, `cloudSnapshot-${farm}.json`, snapshot(farm, [{ ...animal, id: 7, syncId: animal.id }]));
  await saveFixture(farm, 'cattle-record-sync.json', [{ ...animal, lifecycle: death, cloudUpdatedAt: afterTime }]);
  await saveFixture(farm, 'calves-sync.json', [{ id: 'calf-a', calfNumber: '4567', lifecycle: death }]);
  const names = await fs.readdir(path.join(root, 'farms', farm));
  const bytes = await Promise.all(names.map(name => fs.readFile(path.join(root, 'farms', farm, name), 'utf8')));
  const ledger = await runWithFarm(farm, readLifecycleAlertLedger);
  assert.equal(ledger.cattle.length, 1); assert.equal(ledger.calves.length, 1);
  assert.deepEqual(ledger.cattle[0].lifecycle, death);
  assert.deepEqual(await Promise.all(names.map(name => fs.readFile(path.join(root, 'farms', farm, name), 'utf8'))), bytes);
  assert.deepEqual(await runWithFarm('unrelated-farm', readLifecycleAlertLedger), { cattle: [], calves: [] });
  await saveFixture('wrong-farm', 'cloudSnapshot-wrong-farm.json', snapshot(farm, []));
  await assert.rejects(runWithFarm('wrong-farm', readLifecycleAlertLedger), /FARM_MISMATCH/);
});

test('automatic push collection suppresses ended work without deleting source plans or sending notifications', async () => {
  const farm = 'farm-lifecycle-automatic';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const oldDeath = { version: 1, death: { ...death.death, date: '2020-01-01' } };
  const oldCulling = { version: 1, culling: { ...culling.culling, date: '2020-01-01' } };
  const cattle = [{ ...animal, lifecycle: oldDeath }, { ...animal, id: 'cow-b', earTag: '0456', identificationNumber: '1111111111', lifecycle: oldCulling }];
  const schedules = [
    { id: 1, targetNumber: '0123', targetName: '死亡牛', title: '給餌', scheduleType: 'その他', status: '未完了', dueDate: today },
    { id: 2, targetNumber: '0456', targetName: '廃用牛', title: '人工授精', scheduleType: 'その他', status: '未完了', dueDate: today },
    { id: 3, targetNumber: '0456', targetName: '廃用牛', title: '給餌', scheduleType: 'その他', status: '未完了', dueDate: today },
  ];
  const fixtures: Record<string, unknown> = {
    'cattle-record-sync.json': cattle, 'calves-sync.json': [], 'schedules.json': schedules,
    'breedings.json': cattle.map((cow, index) => ({ id: `breeding-${index}`, cowEarTag: cow.earTag, cowName: cow.name, pregnancyResult: '受胎', expectedCalvingDate: today })),
    'vaccines.json': cattle.map((cow, index) => ({ id: index, targetType: '成牛', targetNumber: cow.earTag, vaccineName: 'ワクチン', nextDueDate: today, status: '未接種' })),
    'treatments.json': cattle.map((cow, index) => ({ id: index, targetNumber: cow.earTag, progress: '治療中', treatmentDate: today, withdrawalEndDate: today })),
    'alert-settings.json': { scheduleDays: 14, pregnancyCheckDays: 14, nextHeatDays: 14, recheckDays: 14, calvingDays: 60, vaccineDays: 30 },
  };
  for (const [name, value] of Object.entries(fixtures)) await saveFixture(farm, name, value);
  const before = await Promise.all(Object.keys(fixtures).map(name => fs.readFile(path.join(root, 'farms', farm, name), 'utf8')));
  const alerts = await runWithFarm(farm, collectFarmAlerts);
  assert.deepEqual(alerts.map(row => row.id).sort(), ['schedule-3', 'treatment-1', 'vaccine-1', 'withdrawal-1']);
  assert.deepEqual(await Promise.all(Object.keys(fixtures).map(name => fs.readFile(path.join(root, 'farms', farm, name), 'utf8'))), before);
});
