import { getAllRecords, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Cattle } from '../types/cattle';
import { fetchSyncedCattleRecords, makeCattleSyncId, pushCattleRecordToSyncStore } from './cattleRecordSyncApi';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';

type LocalCattle = Cattle & StoredRecord & { syncId?: string; cloudUpdatedAt?: string };
const norm = (value: unknown) => String(value ?? '').trim();

export type SingleCattleRetryPreview = {
  identificationNumber: string;
  localId: number;
  name: string;
  earTag: string;
  syncId: string;
  cloudMatchCount: number;
  canRetry: boolean;
  reason?: string;
};

export async function previewSingleCattleCloudRetry(identificationNumber: string): Promise<SingleCattleRetryPreview> {
  const identifier = norm(identificationNumber);
  if (!identifier) throw new Error('個体識別番号が必要です。');
  if (!getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync) {
    throw new Error('この契約プランではクラウド同期を利用できません。');
  }

  const local = (await getAllRecords<LocalCattle>('cattle')).filter(r => norm(r.identificationNumber) === identifier);
  if (local.length !== 1) throw new Error('該当する個体が端末内に1頭だけ存在することを確認できません。');
  const cow = local[0];
  const cloud = await fetchSyncedCattleRecords();
  const syncId = makeCattleSyncId(cow);
  const conflicts = cloud.filter(r =>
    norm(r.id) === syncId ||
    norm(r.identificationNumber) === identifier ||
    (norm(cow.earTag) !== '' && norm(r.earTag) === norm(cow.earTag))
  );
  const reason = conflicts.length ? 'クラウドに同一識別番号・耳標番号・同期IDの記録があります。自動送信を禁止します。' : undefined;
  return { identificationNumber: identifier, localId: Number(cow.id), name: cow.name,
    earTag: cow.earTag, syncId, cloudMatchCount: conflicts.length, canRetry: !reason, reason };
}

// This function is intentionally not wired to any UI. Calling it must require an
// explicit user-confirmed action after reviewing a fresh preview.
export async function retrySingleCattleCloudUpload(
  identificationNumber: string,
  expectedLocalId: number
): Promise<{ syncId: string; cloudUpdatedAt?: string }> {
  const preview = await previewSingleCattleCloudRetry(identificationNumber);
  if (!preview.canRetry || preview.localId !== expectedLocalId) {
    throw new Error(preview.reason || '対象の端末内IDが変わりました。処理を中止しました。');
  }
  const cow = (await getAllRecords<LocalCattle>('cattle'))
    .find(r => Number(r.id) === expectedLocalId && norm(r.identificationNumber) === preview.identificationNumber);
  if (!cow) throw new Error('対象個体が見つかりません。');
  const result = await pushCattleRecordToSyncStore(cow);
  if (norm(result.id) !== preview.syncId) throw new Error('クラウドの同期IDが一致しません。');
  await saveRecordPreservingTimestamps<LocalCattle>('cattle', {
    ...cow, syncId: result.id, cloudUpdatedAt: result.cloudUpdatedAt,
  });
  return { syncId: result.id, cloudUpdatedAt: result.cloudUpdatedAt };
}
