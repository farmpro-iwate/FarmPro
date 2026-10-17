import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runWithFarm } from '../farmContext';
import { createSyncedCattleRecordIfAbsent, listSyncedCattleRecords, syncCattleRecord } from '../cattleRecordSyncStore';

const oldDataDir = process.env.FARMPRO_DATA_DIR;
let tempDir = '';
before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-cattle-create-only-'));
  process.env.FARMPRO_DATA_DIR = tempDir;
});
after(async () => {
  if (oldDataDir === undefined) delete process.env.FARMPRO_DATA_DIR;
  else process.env.FARMPRO_DATA_DIR = oldDataDir;
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

const record = (n: string) => ({
  id: `idn:${n}`,
  identificationNumber: n,
  earTag: n.slice(-4),
  name: `cow-${n}`,
  birthday: '2026-01-04',
  stage: '育成牛' as const,
});
const inFarm = <T>(farm: string, action: () => Promise<T>) => runWithFarm(farm, action);

test('create-only refuses overwrite by exact sync ID and preserves stored values', async () => {
  await inFarm('retry-test-a', async () => {
    await createSyncedCattleRecordIfAbsent('idn:1391057543', record('1391057543'));
    await assert.rejects(
      createSyncedCattleRecordIfAbsent('idn:1391057543', { ...record('1391057543'), name: 'OVERWRITE' }),
      /CATTLE_RECORD_ALREADY_EXISTS/,
    );
    const all = await listSyncedCattleRecords();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, 'cow-1391057543');
  });
});

test('same cow with a different ID cannot be inserted twice', async () => {
  await inFarm('retry-test-b', async () => {
    await createSyncedCattleRecordIfAbsent('idn:1391057543', record('1391057543'));
    await assert.rejects(
      createSyncedCattleRecordIfAbsent('idn:1391057544', { ...record('1391057544'), earTag: '5754' }),
      /CATTLE_RECORD_ALREADY_EXISTS/,
    );
    assert.equal((await listSyncedCattleRecords()).length, 1);
  });
});

test('concurrent create-only requests allow just one insert', async () => {
  await inFarm('retry-test-c', async () => {
    const cattle = record('1391057543');
    const outcomes = await Promise.allSettled([
      createSyncedCattleRecordIfAbsent(cattle.id, cattle),
      createSyncedCattleRecordIfAbsent(cattle.id, { ...cattle, name: 'second' }),
    ]);
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(o => o.status === 'rejected').length, 1);
    assert.equal((await listSyncedCattleRecords()).length, 1);
  });
});

test('normal sync and create-only both use the same farm write lock', async () => {
  await inFarm('retry-test-d', async () => {
    const cattle = record('1391057543');
    const outcomes = await Promise.allSettled([
      syncCattleRecord(cattle.id, cattle),
      createSyncedCattleRecordIfAbsent(cattle.id, { ...cattle, name: 'created' }),
    ]);
    assert.equal((await listSyncedCattleRecords()).length, 1);
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length >= 1, true);
  });
});

test('farm data remains separated', async () => {
  await inFarm('retry-test-e', async () => {
    await createSyncedCattleRecordIfAbsent('idn:1391057543', record('1391057543'));
  });
  const other = await inFarm('retry-test-f', () => listSyncedCattleRecords());
  assert.equal(other.length, 0);
});

test('invalid ID does not create records', async () => {
  await inFarm('retry-test-g', async () => {
    await assert.rejects(
      createSyncedCattleRecordIfAbsent('legacy:12', record('1391057543')),
      /INVALID_CATTLE_RECORD_ID/,
    );
    assert.equal((await listSyncedCattleRecords()).length, 0);
  });
});
