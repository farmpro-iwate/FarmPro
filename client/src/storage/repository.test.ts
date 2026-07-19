import 'fake-indexeddb/auto';

Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
});

Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
});
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStore,
  deleteRecord,
  getAllRecords,
  getRecordById,
  replaceAllRecords,
  saveManyRecords,
  saveRecord,
} from './repository';

interface TestRecord {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

describe('IndexedDB repository', () => {
  beforeEach(async () => {
    await clearStore('metadata');
  });

  it('1件保存してID指定取得できる', async () => {
    const saved = await saveRecord<TestRecord>('metadata', {
      id: 'test-1',
      name: '牛A',
    });

    const record = await getRecordById<TestRecord>('metadata', 'test-1');

    expect(record).toEqual(saved);
    expect(record?.createdAt).toBeTruthy();
    expect(record?.updatedAt).toBeTruthy();
  });

  it('複数件保存して全件取得できる', async () => {
    await saveManyRecords<TestRecord>('metadata', [
      { id: 'test-1', name: '牛A' },
      { id: 'test-2', name: '牛B' },
    ]);

    const records = await getAllRecords<TestRecord>('metadata');

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.id).sort()).toEqual([
      'test-1',
      'test-2',
    ]);
  });

  it('1件削除できる', async () => {
    await saveRecord<TestRecord>('metadata', {
      id: 'test-1',
      name: '牛A',
    });

    await deleteRecord('metadata', 'test-1');

    const record = await getRecordById<TestRecord>('metadata', 'test-1');
    expect(record).toBeUndefined();
  });

  it('ストア全削除できる', async () => {
    await saveManyRecords<TestRecord>('metadata', [
      { id: 'test-1', name: '牛A' },
      { id: 'test-2', name: '牛B' },
    ]);

    await clearStore('metadata');

    const records = await getAllRecords<TestRecord>('metadata');
    expect(records).toEqual([]);
  });

  it('全件入れ替えできる', async () => {
    await saveManyRecords<TestRecord>('metadata', [
      { id: 'old-1', name: '旧データ' },
    ]);

    await replaceAllRecords<TestRecord>('metadata', [
      { id: 'new-1', name: '新データA' },
      { id: 'new-2', name: '新データB' },
    ]);

    const records = await getAllRecords<TestRecord>('metadata');

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.id).sort()).toEqual([
      'new-1',
      'new-2',
    ]);
  });
});



