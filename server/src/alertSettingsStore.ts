import { readJson, writeJson } from './jsonStore';

export type AlertSettingsCloudRecord = {
  scheduleDays: number;
  pregnancyCheckDays: number;
  nextHeatDays: number;
  recheckDays: number;
  calvingDays: number;
  vaccineDays: number;
  cloudUpdatedAt?: string;
};

const fileName = 'alert-settings.json';

const defaultSettings: AlertSettingsCloudRecord = {
  scheduleDays: 14,
  pregnancyCheckDays: 14,
  nextHeatDays: 14,
  recheckDays: 14,
  calvingDays: 60,
  vaccineDays: 30,
};

function normalizeDays(value: unknown, fallback: number) {
  const days = Number(value);
  if (!Number.isFinite(days)) return fallback;
  return Math.min(365, Math.max(0, Math.round(days)));
}

function normalizeSettings(input: Partial<AlertSettingsCloudRecord>): AlertSettingsCloudRecord {
  return {
    scheduleDays: normalizeDays(input.scheduleDays, defaultSettings.scheduleDays),
    pregnancyCheckDays: normalizeDays(input.pregnancyCheckDays, defaultSettings.pregnancyCheckDays),
    nextHeatDays: normalizeDays(input.nextHeatDays, defaultSettings.nextHeatDays),
    recheckDays: normalizeDays(input.recheckDays, defaultSettings.recheckDays),
    calvingDays: normalizeDays(input.calvingDays, defaultSettings.calvingDays),
    vaccineDays: normalizeDays(input.vaccineDays, defaultSettings.vaccineDays),
    cloudUpdatedAt: input.cloudUpdatedAt,
  };
}

export async function getAlertSettingsFromCloud() {
  const saved = await readJson<AlertSettingsCloudRecord>(fileName, defaultSettings);
  return normalizeSettings(saved);
}

export async function saveAlertSettingsToCloud(input: AlertSettingsCloudRecord) {
  const saved = normalizeSettings({
    ...input,
    cloudUpdatedAt: new Date().toISOString(),
  });
  await writeJson(fileName, saved);
  return saved;
}
