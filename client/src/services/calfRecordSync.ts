import {
  assertAnimalSyncContext, withAnimalSync, withAnimalSyncRequest,
  type AnimalSyncContext,
} from './animalRecordSyncSafety';

export type CalfRecordForSync = {
  id: number;
  calvingId?: string;
  syncRecordId?: string;
  [key: string]: unknown;
};

export function calfRecordForCloud(record: CalfRecordForSync): Record<string, unknown> {
  const fields = Object.fromEntries(Object.entries(record).filter(([key]) =>
    key !== 'cloudSyncPending' && key !== 'syncWarning' &&
    key !== 'cloudUpdatedAt' && key !== 'syncRecordId' && !key.startsWith('animalSync'),
  ));
  return {
    ...fields,
    note: record.note ?? record.memo ?? '',
    id: record.syncRecordId || (record.calvingId ? `calving:${record.calvingId}` : `local-calf:${record.id}`),
  };
}

async function readApiError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `子牛台帳のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `子牛台帳のクラウド同期に失敗しました（${response.status}）`;
  }
}

type CalfSyncOptions = { context?: AnimalSyncContext; ifMatch?: string; createOnly?: boolean };

/** The caller owns the calves lock when it supplies a captured context. */
export async function syncCalfCreatedFromCalving(record: CalfRecordForSync, options: CalfSyncOptions = {}) {
  const send = async (context: AnimalSyncContext) => {
    assertAnimalSyncContext(context);
    if (!context.token) throw new Error('ログインが必要です');
    const payload = calfRecordForCloud(record);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`,
    };
    if (options.createOnly) headers['If-None-Match'] = '*';
    else if (options.ifMatch) headers['If-Match'] = JSON.stringify(options.ifMatch);
    else if (typeof record.cloudUpdatedAt === 'string') headers['If-Match'] = JSON.stringify(record.cloudUpdatedAt);

    return withAnimalSyncRequest(async (signal) => {
      const response = await fetch(`/api/calves/record-sync/${encodeURIComponent(String(payload.id))}`, {
        method: 'PUT', headers, body: JSON.stringify(payload), signal,
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const synced = await response.json();
      assertAnimalSyncContext(context);
      return synced;
    });
  };
  return options.context ? send(options.context) : withAnimalSync('calves', send);
}
