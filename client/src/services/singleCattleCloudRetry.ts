import { getAllRecords } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Cattle } from '../types/cattle';
import { fetchSyncedCattleRecords, makeCattleSyncId } from './cattleRecordSyncApi';
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

// Fail closed: the current PUT API updates an existing record with the same sync ID.
// A preview followed by PUT is not an atomic create-if-absent operation and
// could overwrite another device's record. Do not enable upload until the server
// offers an authenticated, farm-scoped, atomic create-only endpoint.
export async function retrySingleCattleCloudUpload(
  _identificationNumber: string,
  _expectedLocalId: number
): Promise<never> {
  throw new Error('安全な新規登録専用APIが未実装のため、クラウド再送信を停止しています。');
}
