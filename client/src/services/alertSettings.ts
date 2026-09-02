import { getFarmProPlan } from '../plans/policy';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getRecordById, saveRecord } from '../storage/repository';
import { getAuthToken } from './authClient';

export type AlertSettings = {
  scheduleDays: number;
  pregnancyCheckDays: number;
  nextHeatDays: number;
  recheckDays: number;
  calvingDays: number;
  vaccineDays: number;
};

const SETTINGS_ID = 'alert-settings';

export const defaultAlertSettings: AlertSettings = {
  scheduleDays: 14,
  pregnancyCheckDays: 14,
  nextHeatDays: 14,
  recheckDays: 14,
  calvingDays: 60,
  vaccineDays: 30,
};

type AlertSettingsRecord = AlertSettings & {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
};

type AlertSettingsCloudRecord = AlertSettings & {
  cloudUpdatedAt?: string;
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

function authHeaders() {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function normalizeDays(value: unknown, fallback: number) {
  const days = Number(value);
  if (!Number.isFinite(days)) return fallback;
  return Math.min(365, Math.max(0, Math.round(days)));
}

function normalizeSettings(input?: Partial<AlertSettings> | null): AlertSettings {
  return {
    scheduleDays: normalizeDays(input?.scheduleDays, defaultAlertSettings.scheduleDays),
    pregnancyCheckDays: normalizeDays(input?.pregnancyCheckDays, defaultAlertSettings.pregnancyCheckDays),
    nextHeatDays: normalizeDays(input?.nextHeatDays, defaultAlertSettings.nextHeatDays),
    recheckDays: normalizeDays(input?.recheckDays, defaultAlertSettings.recheckDays),
    calvingDays: normalizeDays(input?.calvingDays, defaultAlertSettings.calvingDays),
    vaccineDays: normalizeDays(input?.vaccineDays, defaultAlertSettings.vaccineDays),
  };
}

async function fetchCloudSettings(): Promise<AlertSettingsCloudRecord> {
  const response = await fetch('/api/alert-settings', {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('アラート設定の取得に失敗しました');
  return response.json() as Promise<AlertSettingsCloudRecord>;
}

async function saveCloudSettings(input: AlertSettings): Promise<AlertSettingsCloudRecord> {
  const response = await fetch('/api/alert-settings', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('アラート設定の同期に失敗しました');
  return response.json() as Promise<AlertSettingsCloudRecord>;
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const localRecord = await getRecordById<AlertSettingsRecord>('metadata', SETTINGS_ID);
  const localSettings = normalizeSettings(localRecord);

  if (!shouldUseCloudSync()) return localSettings;

  try {
    const cloud = await fetchCloudSettings();
    if (!cloud.cloudUpdatedAt) return localSettings;

    const normalized = normalizeSettings(cloud);
    await saveRecord<AlertSettingsRecord>('metadata', {
      id: SETTINGS_ID,
      ...normalized,
      cloudUpdatedAt: cloud.cloudUpdatedAt,
    });
    return normalized;
  } catch (error) {
    console.warn('アラート設定のクラウド取り込みをスキップしました。', error);
    return localSettings;
  }
}

export async function saveAlertSettings(input: AlertSettings): Promise<AlertSettings> {
  const normalized = normalizeSettings(input);
  let cloudUpdatedAt: string | undefined;

  await saveRecord<AlertSettingsRecord>('metadata', {
    id: SETTINGS_ID,
    ...normalized,
  });

  if (shouldUseCloudSync()) {
    try {
      const cloud = await saveCloudSettings(normalized);
      cloudUpdatedAt = cloud.cloudUpdatedAt;
      await saveRecord<AlertSettingsRecord>('metadata', {
        id: SETTINGS_ID,
        ...normalized,
        cloudUpdatedAt,
      });
    } catch (error) {
      console.warn('アラート設定は端末内に保存しましたが、クラウド同期に失敗しました。', error);
    }
  }

  return normalized;
}
