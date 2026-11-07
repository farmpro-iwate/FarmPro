import { openFarmProDatabase } from '../storage/db';
import { assertAnimalSyncContext, getAnimalSyncContext } from './animalRecordSyncSafety';
import type { MaternalSnapshot, AnalysisRecord } from '../utils/maternalAnalysis';

/** One read-only transaction gives all comparisons the same farm-local snapshot. */
export async function getMaternalSnapshot(): Promise<MaternalSnapshot> {
  const context = getAnimalSyncContext();
  const database = await openFarmProDatabase();
  assertAnimalSyncContext(context);
  const stores = ['cattle', 'calves', 'calvings', 'breedings', 'sales'] as const;
  const transaction = database.transaction([...stores], 'readonly');
  const result = {} as MaternalSnapshot;
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      try { assertAnimalSyncContext(context); resolve(result); } catch (error) { reject(error); }
    };
    transaction.onerror = () => reject(transaction.error || new Error('分析用の記録を読み込めませんでした。'));
    transaction.onabort = () => reject(transaction.error || new Error('分析用の読み込みが中断されました。'));
    stores.forEach(store => {
      const request = transaction.objectStore(store).getAll();
      request.onsuccess = () => { result[store] = request.result as AnalysisRecord[]; };
    });
  });
}
