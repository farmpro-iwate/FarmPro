import { getAllRecords, getRecordById } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Cattle } from '../types/cattle';
import { fetchSyncedCattleRecords, makeCattleSyncId, createCattleRecordInCloudIfAbsent, sameCattleSyncContent, toSyncedCattleRecord } from './cattleRecordSyncApi';
import { assertAnimalSyncContext, changeMatchingAnimal, sameAnimalSyncRecord, withAnimalSync, type AnimalSyncContext } from './animalRecordSyncSafety';

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

async function previewSingleCattle(identificationNumber: string, context: AnimalSyncContext): Promise<{ preview: SingleCattleRetryPreview; cow: LocalCattle }> {
  const identifier = norm(identificationNumber);
  if (!identifier) throw new Error('個体識別番号が必要です。');
  if (!context.cloudEnabled) {
    throw new Error('この契約プランではクラウド同期を利用できません。');
  }

  const local = (await getAllRecords<LocalCattle>('cattle')).filter(r => norm(r.identificationNumber) === identifier);
  assertAnimalSyncContext(context);
  if (local.length !== 1) throw new Error('該当する個体が端末内に1頭だけ存在することを確認できません。');
  const cow = local[0];
  const cloud = await fetchSyncedCattleRecords(context);
  const current = await getRecordById<LocalCattle>('cattle', cow.id);
  assertAnimalSyncContext(context);
  if (!sameAnimalSyncRecord(cow, current)) throw new Error('端末内の対象個体が変わりました。処理を中止しました。');
  const syncId = makeCattleSyncId(cow);
  const conflicts = cloud.filter(r =>
    norm(r.id) === syncId ||
    norm(r.identificationNumber) === identifier ||
    (norm(cow.earTag) !== '' && norm(r.earTag) === norm(cow.earTag))
  );
  const reason = conflicts.length ? 'クラウドに同一識別番号・耳標番号・同期IDの記録があります。自動送信を禁止します。' : undefined;
  return { cow, preview: { identificationNumber: identifier, localId: Number(cow.id), name: cow.name,
    earTag: cow.earTag, syncId, cloudMatchCount: conflicts.length, canRetry: !reason, reason } };
}

export async function previewSingleCattleCloudRetry(identificationNumber: string): Promise<SingleCattleRetryPreview> {
  return withAnimalSync('cattle', async context => (await previewSingleCattle(identificationNumber, context)).preview);
}

// Must be invoked only after explicit user confirmation of the preview.
// Server checks for duplicates again under the farm-scoped write lock.
export async function retrySingleCattleCloudUpload(
  identificationNumber: string,
  expectedLocalId: number,
): Promise<{ syncId: string; cloudUpdatedAt?: string }> {
  return withAnimalSync('cattle', async context => {
  const { preview, cow } = await previewSingleCattle(identificationNumber, context);
  if (!preview.canRetry || preview.localId !== expectedLocalId) {
    throw new Error(preview.reason || '対象の端末内IDが変わりました。処理を中止しました。');
  }
  if (preview.syncId !== `idn:${preview.identificationNumber}`) {
    throw new Error('同期IDが個体識別番号と一致しません。処理を中止しました。');
  }
  const current = await getRecordById<LocalCattle>('cattle', expectedLocalId);
  assertAnimalSyncContext(context);
  if (!current || !sameAnimalSyncRecord(cow, current) || makeCattleSyncId(current) !== preview.syncId) {
    throw new Error('端末内の対象個体が変わりました。処理を中止しました。');
  }
  const uploaded = await createCattleRecordInCloudIfAbsent(current, context);
  assertAnimalSyncContext(context);
  if (uploaded.id !== preview.syncId || uploaded.deletedAt || !uploaded.cloudUpdatedAt ||
      !sameCattleSyncContent(toSyncedCattleRecord(current), uploaded)) throw new Error('サーバーの保存内容が一致しません。端末の記録を保持しました。');
  const { animalSyncOrigin: _origin, animalSyncBase: _base, animalSyncAttempt: _attempt, syncWarning: _warning, ...content } = current;
  // Only synchronization metadata changes. Business content and local IDs stay untouched.
  if (!await changeMatchingAnimal('cattle', context, current.id, current,
    { ...content, syncId: uploaded.id, cloudUpdatedAt: uploaded.cloudUpdatedAt, cloudSyncPending: false })) {
    throw new Error('送信中に端末の記録が変わりました。古い保存結果は反映していません。');
  }
  return { syncId: uploaded.id, cloudUpdatedAt: uploaded.cloudUpdatedAt };
  });
}
