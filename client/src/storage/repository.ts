import { openFarmProDatabase } from './db';
import type { StoredRecord, StoreName } from './types';

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('保存処理に失敗しました。'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('保存処理が中断されました。'));
  });
}

function waitForRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('データ処理に失敗しました。'));
  });
}

export async function getAllRecords<T extends StoredRecord>(
  storeName: StoreName,
): Promise<T[]> {
  const database = await openFarmProDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  const records = await waitForRequest(store.getAll() as IDBRequest<T[]>);

  await waitForTransaction(transaction);
  return records;
}

export async function getRecordById<T extends StoredRecord>(
  storeName: StoreName,
  id: string | number,
): Promise<T | undefined> {
  const database = await openFarmProDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  const record = await waitForRequest(
    store.get(id) as IDBRequest<T | undefined>,
  );

  await waitForTransaction(transaction);
  return record;
}

export async function saveRecord<T extends StoredRecord>(
  storeName: StoreName,
  record: T,
): Promise<T> {
  const database = await openFarmProDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);

  const now = new Date().toISOString();
  const existing = await waitForRequest(
    store.get(record.id) as IDBRequest<T | undefined>,
  );

  const savedRecord = {
    ...record,
    createdAt: existing?.createdAt ?? record.createdAt ?? now,
    updatedAt: now,
  } as T;

  await waitForRequest(store.put(savedRecord));
  await waitForTransaction(transaction);

  return savedRecord;
}

export async function saveManyRecords<T extends StoredRecord>(
  storeName: StoreName,
  records: T[],
): Promise<T[]> {
  const database = await openFarmProDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  const now = new Date().toISOString();

  const savedRecords = records.map((record) => ({
    ...record,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
  })) as T[];

  for (const record of savedRecords) {
    store.put(record);
  }

  await waitForTransaction(transaction);
  return savedRecords;
}

export async function deleteRecord(
  storeName: StoreName,
  id: string | number,
): Promise<void> {
  const database = await openFarmProDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);

  store.delete(id);
  await waitForTransaction(transaction);
}

export async function clearStore(storeName: StoreName): Promise<void> {
  const database = await openFarmProDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);

  store.clear();
  await waitForTransaction(transaction);
}

export async function replaceAllRecords<T extends StoredRecord>(
  storeName: StoreName,
  records: T[],
): Promise<T[]> {
  const database = await openFarmProDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  const now = new Date().toISOString();

  store.clear();

  const savedRecords = records.map((record) => ({
    ...record,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
  })) as T[];

  for (const record of savedRecords) {
    store.put(record);
  }

  await waitForTransaction(transaction);
  return savedRecords;
}
