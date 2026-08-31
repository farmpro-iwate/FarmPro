import type { Cattle } from '../types/cattle';
import { getAllRecords, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import {
  fetchSyncedCattleRecords,
  makeCattleSyncId,
  pushCattleRecordToSyncStore,
  type SyncedCattleRecord,
} from './cattleRecordSyncApi';

type StoredCattle = Cattle & StoredRecord & {
  syncId?: string;
  cloudUpdatedAt?: string;
};

export type CattleRecordBackfillConflictReason =
  | 'syncId'
  | 'earTag'
  | 'identificationNumber'
  | 'deleted';

export type CattleRecordBackfillConflict = {
  local: StoredCattle;
  cloud: SyncedCattleRecord;
  reason: CattleRecordBackfillConflictReason;
};

export type CattleRecordBackfillPreview = {
  missing: StoredCattle[];
  matched: StoredCattle[];
  conflicts: CattleRecordBackfillConflict[];
};

export type CattleRecordBackfillResult = {
  uploaded: number;
  missingAfter: number;
  matchedAfter: number;
  conflictsAfter: number;
};

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function findCloudMatches(local: StoredCattle, cloudRecords: SyncedCattleRecord[]) {
  const expectedSyncId = local.syncId || makeCattleSyncId(local);
  const identificationNumber = normalize(local.identificationNumber);
  const earTag = normalize(local.earTag);

  return {
    bySyncId: cloudRecords.find((record) => String(record.id) === expectedSyncId),
    byIdentificationNumber: identificationNumber
      ? cloudRecords.find(
          (record) => normalize(record.identificationNumber) === identificationNumber,
        )
      : undefined,
    byEarTag: earTag
      ? cloudRecords.find((record) => normalize(record.earTag) === earTag)
      : undefined,
  };
}

export async function previewCattleRecordBackfill(): Promise<CattleRecordBackfillPreview> {
  const [localRecords, cloudRecords] = await Promise.all([
    getAllRecords<StoredCattle>('cattle'),
    fetchSyncedCattleRecords(),
  ]);

  const preview: CattleRecordBackfillPreview = {
    missing: [],
    matched: [],
    conflicts: [],
  };

  for (const local of localRecords) {
    const expectedSyncId = local.syncId || makeCattleSyncId(local);
    const matches = findCloudMatches(local, cloudRecords);
    const uniqueMatches = Array.from(
      new Map(
        [matches.bySyncId, matches.byIdentificationNumber, matches.byEarTag]
          .filter(Boolean)
          .map((record) => [String((record as SyncedCattleRecord).id), record as SyncedCattleRecord]),
      ).values(),
    );

    if (uniqueMatches.length === 0) {
      preview.missing.push(local);
      continue;
    }

    if (uniqueMatches.length > 1) {
      const cloud = uniqueMatches[0];
      const reason: CattleRecordBackfillConflictReason =
        matches.byIdentificationNumber && String(matches.byIdentificationNumber.id) !== expectedSyncId
          ? 'identificationNumber'
          : matches.byEarTag && String(matches.byEarTag.id) !== expectedSyncId
            ? 'earTag'
            : 'syncId';
      preview.conflicts.push({ local, cloud, reason });
      continue;
    }

    const cloud = uniqueMatches[0];
    if (cloud.deletedAt) {
      preview.conflicts.push({ local, cloud, reason: 'deleted' });
      continue;
    }

    if (String(cloud.id) !== expectedSyncId) {
      const reason: CattleRecordBackfillConflictReason =
        normalize(cloud.identificationNumber) === normalize(local.identificationNumber) && normalize(local.identificationNumber)
          ? 'identificationNumber'
          : 'earTag';
      preview.conflicts.push({ local, cloud, reason });
      continue;
    }

    if (
      normalize(cloud.earTag) !== normalize(local.earTag) ||
      normalize(cloud.identificationNumber) !== normalize(local.identificationNumber)
    ) {
      preview.conflicts.push({ local, cloud, reason: 'syncId' });
      continue;
    }

    preview.matched.push(local);
  }

  return preview;
}

export async function backfillCattleRecordsToSyncStore(): Promise<CattleRecordBackfillResult> {
  const before = await previewCattleRecordBackfill();
  if (before.conflicts.length > 0) {
    throw new Error(
      `牛台帳の新同期ストアに衝突が${before.conflicts.length}件あるため、移行を中止しました。`,
    );
  }

  let uploaded = 0;
  for (const local of before.missing) {
    const synced = await pushCattleRecordToSyncStore(local);
    await saveRecordPreservingTimestamps<StoredCattle>('cattle', {
      ...local,
      syncId: synced.id,
      cloudUpdatedAt: synced.cloudUpdatedAt,
    });
    uploaded += 1;
  }

  const after = await previewCattleRecordBackfill();
  if (after.conflicts.length > 0) {
    throw new Error(
      `牛台帳の移行後確認で衝突が${after.conflicts.length}件見つかったため、追加処理を停止しました。`,
    );
  }

  return {
    uploaded,
    missingAfter: after.missing.length,
    matchedAfter: after.matched.length,
    conflictsAfter: after.conflicts.length,
  };
}
