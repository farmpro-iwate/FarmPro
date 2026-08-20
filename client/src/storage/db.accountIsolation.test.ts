import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_DB_OWNER_KEY } from './db';
import { getAllRecords, saveRecord } from './repository';

const AUTH_USER_KEY = 'farmpro.authUser';

type TestRecord = {
  id: string;
  label: string;
  createdAt?: string;
  updatedAt?: string;
};

function setFarm(farmId: string, email: string) {
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify({
    id: `user-${farmId}`,
    farmId,
    farmName: farmId,
    name: farmId,
    email,
    role: 'owner',
    active: true,
    plan: 'free',
  }));
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe('FarmPro account data isolation', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await deleteDatabase('farmpro-local');
    await deleteDatabase('farmpro-local-farm-farm-a');
    await deleteDatabase('farmpro-local-farm-farm-b');
  });

  it('keeps legacy data visible only to its owner farm', async () => {
    window.localStorage.setItem(LEGACY_DB_OWNER_KEY, 'farm-a');
    setFarm('farm-a', 'a@example.com');

    await saveRecord<TestRecord>('cattle', { id: 'cow-a', label: 'farm-a cow' });
    expect(await getAllRecords<TestRecord>('cattle')).toHaveLength(1);

    setFarm('farm-b', 'b@example.com');
    expect(await getAllRecords<TestRecord>('cattle')).toEqual([]);

    await saveRecord<TestRecord>('cattle', { id: 'cow-b', label: 'farm-b cow' });
    expect((await getAllRecords<TestRecord>('cattle')).map((row) => row.id)).toEqual(['cow-b']);

    setFarm('farm-a', 'a@example.com');
    expect((await getAllRecords<TestRecord>('cattle')).map((row) => row.id)).toEqual(['cow-a']);
  });
});
