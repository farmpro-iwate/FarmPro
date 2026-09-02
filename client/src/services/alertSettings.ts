import { getRecordById, saveRecord } from '../storage/repository';

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
};

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

export async function getAlertSettings(): Promise<AlertSettings> {
  const record = await getRecordById<AlertSettingsRecord>('metadata', SETTINGS_ID);
  return normalizeSettings(record);
}

export async function saveAlertSettings(input: AlertSettings): Promise<AlertSettings> {
  const normalized = normalizeSettings(input);
  await saveRecord<AlertSettingsRecord>('metadata', {
    id: SETTINGS_ID,
    ...normalized,
  });
  return normalized;
}
