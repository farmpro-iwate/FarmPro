import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import { FARM_PRO_STORE_NAMES } from '../storage/db';
import { getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import {
  changeManualSupplyMovement, createSupplyMovement, getSupplyBatches, getSupplyMovements,
  type SupplyInput, type SupplyMovement,
} from './supplyInventoryApi';
import { saveTreatmentWithMedicineSource } from './treatmentInventoryLink';
import { saveBreedingWithEmbryoInventory } from './breedingInventoryLink';
import { getSupplyInventorySyncStatus, syncSupplyInventory } from './supplyInventorySync';
import { SUPPLY_SYNC_STATE_ID, type SupplyInventorySyncState } from './supplyInventorySyncState';
import type { TreatmentInput } from '../types/treatment';
import type { BreedingInput } from '../types/breeding';

const database = vi.hoisted(() => ({ current: undefined as IDBDatabase | undefined }));
vi.mock('../storage/db', async importOriginal => ({
  ...await importOriginal<typeof import('../storage/db')>(),
  openFarmProDatabase: async () => database.current!,
}));

type Device = { name: string; db: IDBDatabase; storage: Record<string, string> };
let pc: Device;
let phone: Device;
let active: Device | undefined;
let cloud: { revision: number; savedAt: string; snapshot: FarmProBackup };
let offline = false;
let puts: FarmProBackup[];
let linkedCloud: Map<string, Record<string, unknown>>;
let calls: string[];
let handler: ((input: string, init?: RequestInit) => Promise<Response | undefined>) | undefined;
let farmSequence = 0;
let farmId = '';

function input(overrides: Partial<SupplyInput> = {}): SupplyInput {
  return {
    kind: '医薬品', action: '購入', date: '2026-11-01', itemName: '試験薬', lotNumber: 'TEST-LOT',
    quantity: 5, unit: '本', expiryDate: '', supplier: '試験仕入先', storageLocation: '試験棚',
    donorCow: '', sire: '', grade: '', cowEarTag: '', unitPrice: 0, amount: 0,
    paymentMethod: '現金', note: '', ...overrides,
  };
}

function row(id: string, overrides: Partial<SupplyInput> = {}): SupplyMovement {
  return {
    ...input({ itemName: `試験薬${id}`, lotNumber: `TEST-${id}`, ...overrides }), id,
    expenseRecorded: false, createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z',
  };
}

function select(device: Device): void {
  if (active) active.storage = Object.fromEntries(Object.entries(localStorage));
  localStorage.clear();
  for (const [key, value] of Object.entries(device.storage)) localStorage.setItem(key, value);
  active = device;
  database.current = device.db;
}

async function device(name: string, rows: SupplyMovement[]): Promise<Device> {
  const factory = new IDBFactory();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(`test-${name}`, 4);
    request.onupgradeneeded = () => {
      for (const store of FARM_PRO_STORE_NAMES) request.result.createObjectStore(store, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['supplyInventory', 'cattle'], 'readwrite');
    for (const record of rows) tx.objectStore('supplyInventory').put(structuredClone(record));
    tx.objectStore('cattle').put({ id: `${name}-cow`, name: `${name}だけの試験牛` });
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  return { name, db, storage: {
    'farmpro.authUser': JSON.stringify({ id: 'test-user', farmId, farmName: '同期試験農場',
      name: '試験', role: 'owner', active: true, plan: 'standard' }),
    'farmpro.authToken': `test-token-${name}`,
  } };
}

async function primeBoth(): Promise<void> {
  select(pc); await syncSupplyInventory();
  select(phone); await syncSupplyInventory();
  select(pc);
}

async function localRows(): Promise<SupplyMovement[]> { return getAllRecords<SupplyMovement>('supplyInventory'); }
async function state(): Promise<SupplyInventorySyncState | undefined> {
  return getRecordById<SupplyInventorySyncState>('metadata', SUPPLY_SYNC_STATE_ID);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => {
  active = undefined;
  farmId = `farm-inventory-test-${++farmSequence}`;
  localStorage.clear();
  history.replaceState({}, '', '/supply-inventory');
  offline = false;
  handler = undefined;
  puts = [];
  linkedCloud = new Map(); calls = [];
  const rows = Array.from({ length: 6 }, (_, i) => row(String(i)));
  const stores = Object.fromEntries(FARM_PRO_STORE_NAMES.map(name => [name, []])) as unknown as FarmProBackup['stores'];
  stores.supplyInventory = structuredClone(rows);
  stores.cattle = [{ id: 'cloud-cow', name: 'クラウドの試験牛' }];
  stores.expenses = [{ id: 'cloud-expense', amount: '999', paymentMethod: '現金' }];
  stores.metadata = [{ id: 'database', schemaVersion: 4, appVersion: 'test' }];
  cloud = { revision: 7, savedAt: '2026-10-31T00:00:00Z', snapshot: {
    format: 'farmpro-backup', schemaVersion: 4, appVersion: 'test',
    exportedAt: '2026-10-31T00:00:00Z', farm: { id: farmId, name: '同期試験農場' }, stores,
  } };
  pc = await device('pc', rows);
  phone = await device('phone', rows);
  select(pc);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (offline) throw new TypeError('offline test');
    calls.push(`${init?.method || 'GET'} ${url}`);
    const custom = await handler?.(url, init);
    if (custom) return custom;
    const linked = url.match(/^\/api\/(treatments|breedings|expenses)\/record-sync\/([^/]+)$/);
    if (linked) {
      const key = `${linked[1]}:${decodeURIComponent(linked[2])}`;
      if (init?.method === 'DELETE') {
        linkedCloud.delete(key);
        return new Response('{}');
      }
      const record = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const movementId = record.medicineInventoryMovementId || record.embryoInventoryMovementId || record.sourceSupplyMovementId;
      if (movementId) {
        expect(cloud.snapshot.stores.supplyInventory.some(row => row.id === movementId)).toBe(true);
      }
      const saved = { ...linkedCloud.get(key), ...record, cloudUpdatedAt: new Date().toISOString() };
      linkedCloud.set(key, saved);
      return new Response(JSON.stringify(saved));
    }
    if (/^\/api\/breedings\/[^/]+$/.test(url) && init?.method === 'DELETE') {
      linkedCloud.delete(`breedings:${decodeURIComponent(url.split('/').pop()!)}`);
      return new Response('{}');
    }
    if (url !== '/api/cloud-snapshots/latest') throw new Error(`Unexpected endpoint: ${url}`);
    if (init?.method !== 'PUT') return new Response(JSON.stringify(cloud));
    const headers = init.headers as Record<string, string>;
    if (Number(headers['X-FarmPro-Cloud-Revision']) !== cloud.revision) {
      return new Response('{}', { status: 409 });
    }
    const candidate = JSON.parse(String(init.body)) as FarmProBackup;
    expect(candidate.farm?.id).toBe(farmId);
    puts.push(structuredClone(candidate));
    cloud = { revision: cloud.revision + 1, savedAt: new Date().toISOString(), snapshot: candidate };
    return new Response(JSON.stringify({ revision: cloud.revision, savedAt: cloud.savedAt }));
  }));
});

afterEach(() => {
  pc?.db.close(); phone?.db.close();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('normal inventory sync across two independent devices', () => {
  it('establishes matching six-record baselines by GET only, without changing other records', async () => {
    const before = structuredClone(cloud);
    await primeBoth();
    expect(puts).toHaveLength(0);
    expect(cloud).toEqual(before);
    expect((await state())?.baseline).toHaveLength(6);
    expect(await getAllRecords('cattle')).toEqual([{ id: 'pc-cow', name: 'pcだけの試験牛' }]);
  });

  it('sends a PC registration to phone, then sends a phone edit back with the same ID', async () => {
    await primeBoth();
    const protectedStores = structuredClone(cloud.snapshot.stores);
    const id = await createSupplyMovement(input({ purchaseReference: 'TEST-INVOICE-1' }), false);
    expect((await state())?.pending).toHaveLength(0);
    select(phone);
    expect((await getSupplyMovements()).find(record => record.id === id)?.quantity).toBe(5);
    await changeManualSupplyMovement(id, input({ purchaseReference: 'TEST-INVOICE-1', quantity: 8 }));
    select(pc);
    const rows = await getSupplyMovements();
    expect(rows.filter(record => record.id === id)).toHaveLength(1);
    expect(rows.find(record => record.id === id)?.quantity).toBe(8);
    for (const store of FARM_PRO_STORE_NAMES.filter(name => name !== 'supplyInventory')) {
      expect(cloud.snapshot.stores[store]).toEqual(protectedStores[store]);
    }
    expect(await getAllRecords('cattle')).toEqual([{ id: 'pc-cow', name: 'pcだけの試験牛' }]);
  });

  it('propagates deletion and does not resurrect it after repeated reads', async () => {
    await primeBoth();
    select(phone);
    await changeManualSupplyMovement('0');
    select(pc);
    expect((await getSupplyMovements()).some(record => record.id === '0')).toBe(false);
    const count = puts.length;
    await getSupplyMovements();
    select(phone); await getSupplyMovements();
    expect(puts).toHaveLength(count);
    expect(cloud.snapshot.stores.supplyInventory.some(record => record.id === '0')).toBe(false);
  });

  it('keeps an offline save in the durable queue and retries without duplication', async () => {
    await primeBoth(); offline = true;
    const id = await createSupplyMovement(input(), false);
    expect((await localRows()).some(record => record.id === id)).toBe(true);
    expect((await state())?.pending).toHaveLength(1);
    expect(getSupplyInventorySyncStatus().state).toBe('pending');
    offline = false; await syncSupplyInventory();
    await syncSupplyInventory();
    expect(cloud.snapshot.stores.supplyInventory.filter(record => record.id === id)).toHaveLength(1);
    expect((await state())?.pending).toHaveLength(0);
  });

  it('recognizes a successful PUT with lost response and a later queued edit', async () => {
    await primeBoth();
    handler = async (_url, init) => {
      if (init?.method !== 'PUT') return undefined;
      const candidate = JSON.parse(String(init.body)) as FarmProBackup;
      cloud = { revision: cloud.revision + 1, savedAt: '2026-11-01T00:00:00Z', snapshot: candidate };
      handler = undefined;
      throw new TypeError('response lost after server commit');
    };
    await changeManualSupplyMovement('0', { ...input(), ...row('0'), quantity: 6 });
    expect((await state())?.pending).toHaveLength(1);
    offline = true;
    await changeManualSupplyMovement('0', { ...input(), ...row('0'), quantity: 7 });
    expect((await state())?.pending).toHaveLength(2);
    offline = false;
    await syncSupplyInventory();
    expect(cloud.snapshot.stores.supplyInventory.find(record => record.id === '0')?.quantity).toBe(7);
    expect((await state())?.pending).toHaveLength(0);
  });

  it('holds conflicting edits to the same record and preserves both device and cloud values', async () => {
    await primeBoth(); offline = true;
    await changeManualSupplyMovement('0', { ...input(), ...row('0'), note: 'PCの変更' });
    select(phone); await changeManualSupplyMovement('0', { ...input(), ...row('0'), note: 'スマホの変更' });
    offline = false; select(pc); await syncSupplyInventory();
    select(phone);
    await expect(syncSupplyInventory()).rejects.toThrow();
    expect(getSupplyInventorySyncStatus().state).toBe('conflict');
    expect((await localRows()).find(record => record.id === '0')?.note).toBe('スマホの変更');
    expect(cloud.snapshot.stores.supplyInventory.find(record => record.id === '0')?.note).toBe('PCの変更');
    expect((await state())?.pending).toHaveLength(1);
  });

  it('combines independent record changes from both devices', async () => {
    await primeBoth(); offline = true;
    await changeManualSupplyMovement('0', { ...input(), ...row('0'), note: 'PC' });
    select(phone); await changeManualSupplyMovement('1', { ...input(), ...row('1'), note: 'スマホ' });
    offline = false; select(pc); await syncSupplyInventory();
    select(phone); await syncSupplyInventory();
    expect(cloud.snapshot.stores.supplyInventory.find(record => record.id === '0')?.note).toBe('PC');
    expect(cloud.snapshot.stores.supplyInventory.find(record => record.id === '1')?.note).toBe('スマホ');
    select(pc); await syncSupplyInventory();
    expect(await localRows()).toEqual(cloud.snapshot.stores.supplyInventory);
  });

  it('rebuilds a candidate after 409 and preserves a concurrent change in another store', async () => {
    await primeBoth();
    handler = async (_url, init) => {
      if (init?.method !== 'PUT') return;
      cloud.revision += 1;
      cloud.snapshot.stores.expenses[0].amount = '12345';
      handler = undefined;
      return new Response('{}', { status: 409 });
    };
    await changeManualSupplyMovement('0', { ...input(), ...row('0'), note: '在庫だけ更新' });
    expect(cloud.snapshot.stores.expenses[0].amount).toBe('12345');
    expect(cloud.snapshot.stores.supplyInventory.find(record => record.id === '0')?.note).toBe('在庫だけ更新');
    expect((await state())?.pending).toHaveLength(0);
  });

  it('does not allow two offline usages to overdraw the same batch', async () => {
    await primeBoth(); offline = true;
    await createSupplyMovement({ ...input(), ...row('0'), action: '使用', quantity: 4 }, false);
    select(phone);
    const id = await createSupplyMovement({ ...input(), ...row('0'), action: '使用', quantity: 4 }, false);
    offline = false; select(pc); await syncSupplyInventory(); select(phone);
    await expect(syncSupplyInventory()).rejects.toThrow();
    expect((await localRows()).some(record => record.id === id)).toBe(true);
    expect(cloud.snapshot.stores.supplyInventory.some(record => record.id === id)).toBe(false);
    expect(getSupplyBatches(cloud.snapshot.stores.supplyInventory as SupplyMovement[], '医薬品')
      .find(batch => batch.lotNumber === 'TEST-0')?.balance).toBe(1);
  });

  it('holds duplicate invoice lines created with different IDs on different devices', async () => {
    await primeBoth(); offline = true;
    await createSupplyMovement(input({ purchaseReference: 'DUPLICATE-LINE' }), false);
    select(phone); await createSupplyMovement(input({ purchaseReference: 'DUPLICATE-LINE' }), false);
    offline = false; select(pc); await syncSupplyInventory(); select(phone);
    await expect(syncSupplyInventory()).rejects.toThrow();
    expect(cloud.snapshot.stores.supplyInventory.filter(record => record.purchaseReference === 'DUPLICATE-LINE')).toHaveLength(1);
  });

  it('refuses an unknown initial difference instead of adopting a direction', async () => {
    await saveRecordPreservingTimestamps('supplyInventory', { ...row('0'), note: '初回の不明な差' });
    await expect(syncSupplyInventory()).rejects.toThrow('未確認');
    expect(puts).toHaveLength(0);
    expect((await localRows()).find(record => record.id === '0')?.note).toBe('初回の不明な差');
    expect(await state()).toBeUndefined();
  });

  it('does not replay a queue copied from the other device', async () => {
    await primeBoth(); offline = true;
    const id = await createSupplyMovement(input(), false);
    const copiedRows = await localRows();
    const copiedState = await state();
    select(phone);
    for (const record of copiedRows) await saveRecordPreservingTimestamps('supplyInventory', record);
    await saveRecordPreservingTimestamps('metadata', copiedState!);
    offline = false;
    await expect(syncSupplyInventory()).rejects.toThrow('未確認');
    expect(puts).toHaveLength(0);
    expect(cloud.snapshot.stores.supplyInventory.some(record => record.id === id)).toBe(false);
  });

  it('refuses another farm and a rolled-back cloud revision', async () => {
    await primeBoth();
    const before = await localRows();
    cloud.snapshot.farm!.id = 'another-farm';
    await expect(syncSupplyInventory()).rejects.toThrow('農場');
    cloud.snapshot.farm!.id = farmId; cloud.revision -= 1;
    await expect(syncSupplyInventory()).rejects.toThrow('世代');
    expect(await localRows()).toEqual(before);
    expect(puts).toHaveLength(0);
  });

  it('stops on an account change while GET is in flight', async () => {
    await primeBoth();
    const before = await state();
    handler = async () => {
      localStorage.setItem('farmpro.authToken', 'new-login-token');
      return new Response(JSON.stringify(cloud));
    };
    await expect(syncSupplyInventory()).rejects.toThrow('ログイン');
    expect(await state()).toEqual(before);
    expect(puts).toHaveLength(0);
    expect(localStorage.getItem('farmpro.authToken')).toBe('new-login-token');
  });

  it('stops if the browser owner changes while GET is in flight', async () => {
    await primeBoth();
    const before = await state();
    handler = async () => {
      localStorage.setItem(`farmpro.supplySyncOwner.${encodeURIComponent(farmId)}`, 'changed-owner');
      return new Response(JSON.stringify(cloud));
    };
    await expect(syncSupplyInventory()).rejects.toThrow();
    expect(await state()).toEqual(before);
    expect(puts).toHaveLength(0);
  });

  it('does not start network sync on recovery or backup pages or with the Free plan', async () => {
    history.replaceState({}, '', '/device-sync?receive=cloud'); await syncSupplyInventory();
    history.replaceState({}, '', '/backups'); await syncSupplyInventory();
    history.replaceState({}, '', '/supply-inventory'); localStorage.setItem('farmpro.plan', 'free');
    await syncSupplyInventory();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('includes a local save that completes while the initial GET is waiting', async () => {
    await primeBoth();
    const started = deferred<void>(); const release = deferred<void>();
    handler = async (_url, init) => {
      if (init?.method === 'PUT') return;
      handler = undefined; started.resolve(); await release.promise;
      return new Response(JSON.stringify(cloud));
    };
    const sync = syncSupplyInventory(); await started.promise;
    const save = changeManualSupplyMovement('0', { ...input(), ...row('0'), note: 'GET待ち中の保存' });
    await vi.waitFor(async () => expect((await state())?.pending).toHaveLength(1));
    release.resolve(); await Promise.all([sync, save]);
    expect((await localRows()).find(record => record.id === '0')?.note).toBe('GET待ち中の保存');
    expect(cloud.snapshot.stores.supplyInventory.find(record => record.id === '0')?.note).toBe('GET待ち中の保存');
  });

  it('does not acknowledge a later edit as part of an earlier PUT', async () => {
    await primeBoth();
    const started = deferred<void>(); const release = deferred<void>();
    handler = async (_url, init) => {
      if (init?.method !== 'PUT') return;
      handler = undefined; started.resolve(); await release.promise;
      return undefined;
    };
    const first = changeManualSupplyMovement('0', { ...input(), ...row('0'), note: '最初' });
    await started.promise;
    const second = changeManualSupplyMovement('0', { ...input(), ...row('0'), note: '後から保存' });
    await vi.waitFor(async () => expect((await state())?.pending).toHaveLength(2));
    release.resolve(); await Promise.all([first, second]);
    expect((await localRows()).find(record => record.id === '0')?.note).toBe('後から保存');
    expect(cloud.snapshot.stores.supplyInventory.find(record => record.id === '0')?.note).toBe('後から保存');
    expect((await state())?.pending).toHaveLength(0);
  });

  it('retains the original baseline when a later local edit conflicts with a received row during PUT', async () => {
    await primeBoth();
    const before = await state();
    cloud.revision += 1;
    cloud.snapshot.stores.supplyInventory[1].note = '別端末の変更';
    const started = deferred<void>(); const release = deferred<void>();
    handler = async (_url, init) => {
      if (init?.method !== 'PUT') return;
      handler = undefined; started.resolve(); await release.promise;
      return undefined;
    };
    const first = changeManualSupplyMovement('0', { ...input(), ...row('0'), note: 'PCの別の行' });
    await started.promise;
    const second = changeManualSupplyMovement('1', { ...input(), ...row('1'), note: '通信中のPC編集' });
    await vi.waitFor(async () => expect((await state())?.pending).toHaveLength(2));
    release.resolve(); await Promise.all([first, second]);
    expect((await state())?.baseline).toEqual(before?.baseline);
    expect((await state())?.pending).toHaveLength(2);
    expect((await localRows()).find(record => record.id === '1')?.note).toBe('通信中のPC編集');
    expect(cloud.snapshot.stores.supplyInventory.find(record => record.id === '1')?.note).toBe('別端末の変更');
    expect(getSupplyInventorySyncStatus().state).toBe('conflict');
  });

  it('rolls back both received inventory and baseline if the transaction cannot persist', async () => {
    await primeBoth();
    const beforeRows = await localRows(); const beforeState = await state();
    cloud.revision += 1;
    cloud.snapshot.stores.supplyInventory[0].note = 'クラウドからの編集';
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'metadata') throw new DOMException('test quota failure', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    });
    await expect(syncSupplyInventory()).rejects.toThrow();
    expect(await localRows()).toEqual(beforeRows);
    expect(await state()).toEqual(beforeState);
  });

  it('transfers linked treatment and ET stock usage without another purchase expense', async () => {
    const embryo = row('embryo', { kind: '受精卵', unit: '個', quantity: 2 });
    cloud.snapshot.stores.supplyInventory.push(embryo);
    await saveRecordPreservingTimestamps('supplyInventory', embryo);
    select(phone); await saveRecordPreservingTimestamps('supplyInventory', embryo); select(pc);
    await primeBoth();
    const medicineBatch = getSupplyBatches(await localRows(), '医薬品')[0];
    await saveTreatmentWithMedicineSource({
      targetNumber: 'TEST-COW', targetName: '試験牛', recordType: '治療', medicine: medicineBatch.itemName,
      treatmentDate: '2026-11-01', medicineSource: 'farm_stock',
    } as TreatmentInput, { source: 'farm_stock', batchKey: medicineBatch.key, quantity: 1 });
    const embryoBatch = getSupplyBatches(await localRows(), '受精卵')[0];
    await saveBreedingWithEmbryoInventory('test-et', {
      cowEarTag: 'TEST-COW', breedingMethod: '受精卵移植', breedingStatus: '移植実施',
      embryoSource: 'farm_stock', transferDate: '2026-11-01', embryoNumber: embryo.lotNumber,
    } as BreedingInput, embryoBatch.key, { create: true });
    select(phone);
    const received = await getSupplyMovements();
    expect(received.filter(record => record.action === '使用')).toHaveLength(2);
    expect(getSupplyBatches(received, '受精卵')[0].balance).toBe(1);
    expect(await getAllRecords('expenses')).toHaveLength(0);
    expect(cloud.snapshot.stores.expenses).toHaveLength(1);
    expect([...linkedCloud.keys()].filter(key => key.startsWith('treatments:'))).toHaveLength(1);
    expect([...linkedCloud.keys()].filter(key => key.startsWith('breedings:'))).toHaveLength(1);
    expect(getSupplyInventorySyncStatus().state).toBe('synced');
  });

  it('sends a purchase expense after stock is accepted and retries a failed expense separately', async () => {
    await primeBoth();
    handler = async (url) => {
      if (url.startsWith('/api/expenses/record-sync/')) return new Response('{}', { status: 503 });
    };
    const id = await createSupplyMovement(input({ unitPrice: 100, amount: 500, purchaseReference: 'LINKED-INVOICE' }), true);
    expect(cloud.snapshot.stores.supplyInventory.some(record => record.id === id)).toBe(true);
    expect(linkedCloud.size).toBe(0);
    expect(getSupplyInventorySyncStatus().state).toBe('pending');
    const stockPut = calls.findIndex(call => call === 'PUT /api/cloud-snapshots/latest');
    const expensePut = calls.findIndex(call => call.startsWith('PUT /api/expenses/record-sync/'));
    expect(stockPut).toBeLessThan(expensePut);
    const stockSaves = puts.length;
    handler = undefined;
    await syncSupplyInventory();
    expect(puts).toHaveLength(stockSaves);
    expect(linkedCloud.size).toBe(1);
    expect([...linkedCloud.values()][0].amount).toBe('500');
    expect((await getAllRecords('expenses'))[0].cloudSyncPending).toBe(false);
    expect(getSupplyInventorySyncStatus().state).toBe('synced');
  });

  it('flushes a new inventory save made while its previous purchase expense is being sent', async () => {
    await primeBoth();
    const started = deferred<void>(); const release = deferred<void>();
    handler = async url => {
      if (!url.startsWith('/api/expenses/record-sync/')) return undefined;
      handler = undefined; started.resolve(); await release.promise;
      return undefined;
    };
    const purchase = createSupplyMovement(input({ unitPrice: 100, amount: 500 }), true);
    await started.promise;
    const later = changeManualSupplyMovement('0', { ...input(), ...row('0'), note: '経費送信中の在庫変更' });
    await vi.waitFor(async () => expect((await state())?.pending).toHaveLength(1));
    release.resolve(); await Promise.all([purchase, later]);
    expect(cloud.snapshot.stores.supplyInventory.find(record => record.id === '0')?.note).toBe('経費送信中の在庫変更');
    expect((await state())?.pending).toHaveLength(0);
    expect(getSupplyInventorySyncStatus().state).toBe('synced');
  });
});
