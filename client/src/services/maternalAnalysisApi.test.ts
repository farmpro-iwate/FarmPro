import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openFarmProDatabase } from '../storage/db';
import { assertAnimalSyncContext, getAnimalSyncContext } from './animalRecordSyncSafety';
import { getMaternalSnapshot } from './maternalAnalysisApi';
vi.mock('../storage/db', () => ({ openFarmProDatabase: vi.fn() }));
vi.mock('./animalRecordSyncSafety', () => ({ getAnimalSyncContext: vi.fn(), assertAnimalSyncContext: vi.fn() }));
const stores = ['cattle', 'calves', 'calvings', 'breedings', 'sales'];
let db: IDBDatabase;
beforeEach(async () => {
  vi.clearAllMocks();
  const request = indexedDB.open(`analysis-fixture-${Math.random()}`, 1);
  request.onupgradeneeded = () => stores.forEach(s => request.result.createObjectStore(s, { keyPath: 'id' }));
  db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = reject; });
  const tx = db.transaction(stores, 'readwrite');
  stores.forEach(store => tx.objectStore(store).put({ id: store, fixture: true }));
  await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); });
  vi.mocked(openFarmProDatabase).mockResolvedValue(db);
  vi.mocked(getAnimalSyncContext).mockReturnValue({ farmId: 'fixture-farm', userId: 'fixture-user', token: 'fixture-token', cloudEnabled: false, planId: 'free' });
});
describe('maternal analysis snapshot', () => {
  it('reads all five stores in one read-only transaction without changing records or sending requests', async () => {
    const transaction = vi.spyOn(db, 'transaction');
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'));
    const result = await getMaternalSnapshot();
    expect(transaction).toHaveBeenCalledExactlyOnceWith(stores, 'readonly');
    stores.forEach(store => expect(result[store as keyof typeof result]).toEqual([{ id: store, fixture: true }]));
    expect(fetch).not.toHaveBeenCalled();
    expect(assertAnimalSyncContext).toHaveBeenCalledTimes(2);
    fetch.mockRestore(); db.close();
  });
  it('rejects a farm change before the transaction starts', async () => {
    vi.mocked(assertAnimalSyncContext).mockImplementationOnce(() => { throw new Error('farm changed'); });
    const transaction = vi.spyOn(db, 'transaction');
    await expect(getMaternalSnapshot()).rejects.toThrow('farm changed');
    expect(transaction).not.toHaveBeenCalled(); db.close();
  });
  it('discards a result when the login/farm changes during the read', async () => {
    vi.mocked(assertAnimalSyncContext).mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('farm changed during read'); });
    await expect(getMaternalSnapshot()).rejects.toThrow('farm changed during read'); db.close();
  });
});
