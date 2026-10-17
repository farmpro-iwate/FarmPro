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
      createSyncedCattleRecordIfAbsent('idn:1391057544', { ...record('1391057544'), earTag: '7543' }),
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

test('retained calf acquisition and cost survive cloud create/read', async () => {
  await inFarm('retry-test-acquisition', async () => {
    const cattle = { ...record('1391057543'), acquisitionMethod: 'retained' as const,
      acquisitionDate: '2026-10-15', acquisitionCost: 5700, sourceCalfId: 11 };
    await createSyncedCattleRecordIfAbsent(cattle.id, cattle);
    const [saved] = await listSyncedCattleRecords();
    assert.equal(saved.acquisitionMethod, 'retained');
    assert.equal(saved.acquisitionDate, '2026-10-15');
    assert.equal(saved.acquisitionCost, 5700);
    assert.equal(saved.sourceCalfId, 11);
  });
});

test('create-only cannot overwrite a record previously uploaded through normal sync', async () => {
  await inFarm('retry-test-existing-put', async () => {
    const initial = { ...record('1391057543'), name: 'original' };
    await syncCattleRecord(initial.id, initial);
    await assert.rejects(
      createSyncedCattleRecordIfAbsent(initial.id, { ...initial, name: 'replaced' }),
      /CATTLE_RECORD_ALREADY_EXISTS/,
    );
    const [saved] = await listSyncedCattleRecords();
    assert.equal(saved.name, 'original');
    assert.equal((await listSyncedCattleRecords()).length, 1);
  });
});

test('create-only rejects attempts to revive a deleted sync ID', async () => {
  await inFarm('retry-test-tombstone', async () => {
    const initial = record('1391057543');
    await syncCattleRecord(initial.id, { ...initial, deletedAt: new Date().toISOString() });
    await assert.rejects(
      createSyncedCattleRecordIfAbsent(initial.id, initial),
      /CATTLE_RECORD_ALREADY_EXISTS/,
    );
    const [saved] = await listSyncedCattleRecords();
    assert.ok(saved.deletedAt);
  });
});

test('legacy tombstone with the same individual number prevents resurrection', async () => {
  await inFarm('retry-test-legacy-tombstone', async () => {
    const initial = record('1391057543');
    await syncCattleRecord('legacy:13', { ...initial, deletedAt: new Date().toISOString() });
    await assert.rejects(createSyncedCattleRecordIfAbsent(initial.id, initial), /CATTLE_RECORD_ALREADY_EXISTS/);
    const [saved] = await listSyncedCattleRecords();
    assert.equal(saved.id, 'legacy:13'); assert.ok(saved.deletedAt);
  });
});

test('same individual number with a different ear tag and legacy ID is rejected', async () => {
  await inFarm('retry-test-legacy-identifier', async () => {
    const initial = record('1391057543');
    await syncCattleRecord('legacy:13', { ...initial, earTag: 'old' });
    const before = await listSyncedCattleRecords();
    await assert.rejects(createSyncedCattleRecordIfAbsent(initial.id, initial), /CATTLE_RECORD_ALREADY_EXISTS/);
    assert.deepEqual(await listSyncedCattleRecords(), before);
  });
});

test('create-only rejects deleted input without changing existing data', async () => {
  await inFarm('retry-test-deleted-input', async () => {
    const initial = record('1391057543');
    await assert.rejects(createSyncedCattleRecordIfAbsent(initial.id, { ...initial, deletedAt: '2026-10-17' }), /INVALID_CATTLE_RECORD_ID/);
    assert.equal((await listSyncedCattleRecords()).length, 0);
  });
});

test('failed rename preserves exact previous file bytes and releases farm lock for retry', async () => {
  const { mock } = await import('node:test');
  const { dataPath } = await import('../jsonStore');
  await inFarm('retry-test-write-failure', async () => {
    const initial = record('1391057543');
    await createSyncedCattleRecordIfAbsent(initial.id, initial);
    const target = dataPath('cattle-record-sync.json');
    const before = await fs.readFile(target, 'utf8');
    const rename = mock.method(fs, 'rename', async () => { throw new Error('SIMULATED_RENAME_FAILURE'); });
    const second = record('1391057544');
    try { await assert.rejects(createSyncedCattleRecordIfAbsent(second.id, second), /SIMULATED_RENAME_FAILURE/); }
    finally { rename.mock.restore(); }
    assert.equal(await fs.readFile(target, 'utf8'), before);
    assert.deepEqual((await fs.readdir(path.dirname(target))).filter(n => n.endsWith('.tmp')), []);
    await createSyncedCattleRecordIfAbsent(second.id, second);
    assert.equal((await listSyncedCattleRecords()).length, 2);
  });
});

test('corrupt stored JSON fails closed and is never replaced with an empty list', async () => {
  const { dataPath } = await import('../jsonStore');
  await inFarm('retry-test-corrupt', async () => {
    await listSyncedCattleRecords();
    const target = dataPath('cattle-record-sync.json');
    await fs.writeFile(target, '{broken');
    const initial = record('1391057543');
    await assert.rejects(createSyncedCattleRecordIfAbsent(initial.id, initial), SyntaxError);
    assert.equal(await fs.readFile(target, 'utf8'), '{broken');
  });
});

test('partial temporary-file write cannot truncate the stored cattle document', async () => {
  const { mock } = await import('node:test');
  const { dataPath } = await import('../jsonStore');
  await inFarm('retry-test-partial-write', async () => {
    const initial = record('1391057543');
    await createSyncedCattleRecordIfAbsent(initial.id, initial);
    const target = dataPath('cattle-record-sync.json');
    const before = await fs.readFile(target, 'utf8');
    const open = fs.open.bind(fs);
    const patched = mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args);
      handle.writeFile = async () => { await handle.write('{partial'); throw new Error('SIMULATED_DISK_FULL'); };
      return handle;
    });
    const second = record('1391057544');
    try { await assert.rejects(createSyncedCattleRecordIfAbsent(second.id, second), /SIMULATED_DISK_FULL/); }
    finally { patched.mock.restore(); }
    assert.equal(await fs.readFile(target, 'utf8'), before);
    assert.deepEqual((await fs.readdir(path.dirname(target))).filter(n => n.endsWith('.tmp')), []);
    await createSyncedCattleRecordIfAbsent(second.id, second);
    assert.equal((await listSyncedCattleRecords()).length, 2);
  });
});
