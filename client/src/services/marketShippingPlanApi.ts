import { recoveryAwareFetch } from './syncRecoveryGuard';
import { getAuthToken } from './authClient';
import { getRecordById, saveRecord } from '../storage/repository';
import { withRecordSync, shouldApplyRecoveredCloudRecord, rememberAppliedRecoveryRecord, type RecoveryStoragePermit } from './syncRecoveryGuard';

export type MarketSchedule = {
  id: string;
  marketName: string;
  marketDate: string;
};

export type MarketShippingPlanSettings = {
  fiscalYear: string;
  minAgeDays: number;
  maxAgeDays: number;
  schedules: MarketSchedule[];
  cloudUpdatedAt?: string;
};

async function readApiError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `市場出荷予定設定のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `市場出荷予定設定のクラウド同期に失敗しました（${response.status}）`;
  }
}

function authHeaders() {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchMarketShippingPlanSettings(): Promise<MarketShippingPlanSettings> {
  const response = await fetch('/api/market-shipping-plan', {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<MarketShippingPlanSettings>;
}

/** Page-open merge also participates in the same recovery barrier as ledgers. */
export function pullMarketShippingPlanSettings(recoveryPermit?: RecoveryStoragePermit) {
  return withRecordSync(async lease => {
    const saved = await getRecordById<MarketShippingPlanSettings & { id: string }>(
      'metadata', 'market-shipping-plan-settings', recoveryPermit,
    );
    lease.assertCurrent();
    const cloud = await fetchMarketShippingPlanSettings();
    lease.assertCurrent();
    if (!String(cloud.fiscalYear || '').trim() ||
        !shouldApplyRecoveredCloudRecord('market-shipping-plan-settings', cloud)) return saved;
    const result = await saveRecord('metadata', {
      id: 'market-shipping-plan-settings',
      fiscalYear: cloud.fiscalYear,
      minAgeDays: Number(cloud.minAgeDays) || 260,
      maxAgeDays: Number(cloud.maxAgeDays) || 310,
      schedules: Array.isArray(cloud.schedules) ? cloud.schedules : [],
      cloudUpdatedAt: cloud.cloudUpdatedAt,
    }, recoveryPermit);
    lease.assertCurrent();
    rememberAppliedRecoveryRecord('market-shipping-plan-settings', cloud);
    return result;
  }, recoveryPermit);
}

export async function saveMarketShippingPlanSettingsToCloud(
  settings: MarketShippingPlanSettings,
): Promise<MarketShippingPlanSettings> {
  const response = await recoveryAwareFetch('/api/market-shipping-plan', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<MarketShippingPlanSettings>;
}
