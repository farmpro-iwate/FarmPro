import type { FarmProBackup } from '../storage/backup';
import { openFarmProDatabase } from '../storage/db';
import type { StoredRecord } from '../storage/types';

const key = (row: StoredRecord): string =>
  [row.cowEarTag, row.heatDate, row.inseminationDate, row.transferDate]
    .map(v => String(v ?? '').trim()).join('|');

/** Reject impossible chronology before showing or writing a recovery record. */
export function breedingRecoveryDateError(record: StoredRecord): string | null {
  const date = (key: string) => {
    const value = record[key];
    return typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(value) ? value : null;
  };
  const heat = date('heatDate');
  const insemination = date('inseminationDate');
  const transfer = date('transferDate');
  const check = date('pregnancyCheckDate');
  if (heat && insemination && insemination < heat) return '授精日が発情日より前です';
  if (heat && transfer && transfer < heat) return '移植日が発情日より前です';
  const procedure = insemination || transfer;
  if (check && procedure && check < procedure) return '妊娠鑑定日が授精・移植日より前です';
  return null;
}

export type BreedingRecoveryCandidate = {
  record: StoredRecord;
  reason: string;
};

/**
 * Strictly additive v3 -> v4 breeding recovery. Only foreign UUID records
 * with an existing cow, a meaningful date, and no matching event qualify.
 * All decisions are derived from the two original snapshots, never an ID
 * remapping. No database mutation occurs here.
 */
export function planCloudOnlyBreedingAdditions(
  device: FarmProBackup,
  cloud: FarmProBackup,
): { eligible: BreedingRecoveryCandidate[]; blocked: BreedingRecoveryCandidate[] } {
  const eligible: BreedingRecoveryCandidate[] = [];
  const blocked: BreedingRecoveryCandidate[] = [];
  if (!device.farm?.id || device.farm.id !== cloud.farm?.id ||
      device.schemaVersion !== 4 || cloud.schemaVersion !== 3) {
    return { eligible, blocked: [{ record: { id: 'farm' }, reason: '農場ID・データ形式が一致しません' }] };
  }
  const current = device.stores.breedings ?? [];
  const cloudRows = cloud.stores.breedings ?? [];
  const ids = new Set(current.map(row => String(row.id)));
  const cattleTags = new Set((device.stores.cattle ?? []).map(row => String(row.earTag ?? '').trim()).filter(Boolean));
  const signatures = new Set(current.map(key));
  const seenCloud = new Set<string>();
  for (const record of cloudRows) {
    const id = String(record.id);
    if (ids.has(id)) continue;
    const signature = key(record);
    let reason = '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      reason = 'IDがUUID形式ではありません';
    } else if (!String(record.cowEarTag ?? '').trim() || !cattleTags.has(String(record.cowEarTag).trim())) {
      reason = '対応する繁殖牛を確認できません';
    } else if (![record.heatDate, record.inseminationDate, record.transferDate].some(v => typeof v === 'string' && v.trim())) {
      reason = '実施日・発情日を確認できません';
    } else if (breedingRecoveryDateError(record)) {
      reason = breedingRecoveryDateError(record) ?? '';
    } else if (signatures.has(signature) || seenCloud.has(signature)) {
      reason = '同じ牛・同じ日付の記録が存在します';
    }
    if (reason) blocked.push({ record, reason });
    else {
      eligible.push({ record, reason: '既存の記録ID・牛・日付との衝突なし（要確認）' });
      seenCloud.add(signature);
    }
  }
  return { eligible, blocked };
}

/**
 * An atomic, insert-only operation for ONE explicitly reviewed record.
 * Rechecks IDs and event signatures inside the write transaction. IndexedDB
 * add() fails on an existing ID; put(), clear(), or restore() are never used.
 * This function must only be invoked after user review and confirmation.
 */
export async function addReviewedBreedingWithoutOverwrite(record: StoredRecord): Promise<void> {
  const dateError = breedingRecoveryDateError(record);
  if (dateError) throw new Error(dateError);
  const db = await openFarmProDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['breedings', 'cattle'], 'readwrite');
    const store = tx.objectStore('breedings');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('記録の追加に失敗しました'));
    tx.onabort = () => reject(tx.error ?? new Error('既存記録との衝突により追加を中止しました'));
    const cattleRequest = tx.objectStore('cattle').getAll();
    cattleRequest.onsuccess = () => {
      const exists = (cattleRequest.result as StoredRecord[])
        .some(cow => String(cow.earTag ?? '').trim() === String(record.cowEarTag ?? '').trim());
      if (!exists) { tx.abort(); return; }
      const request = store.getAll();
      request.onsuccess = () => {
        const rows = request.result as StoredRecord[];
        if (rows.some(row => String(row.id) === String(record.id) || key(row) === key(record))) {
          tx.abort();
          return;
        }
        store.add(record);
      };
    };
  });
}
