import { FarmSettings } from '../types/settings';
import { getRecordById, saveRecord } from '../storage/repository';

const SETTINGS_ID = 'farm-settings';

type FarmSettingsRecord = FarmSettings & {
  id: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function getFarmSettings(): Promise<FarmSettings> {
  const record = await getRecordById<FarmSettingsRecord>(
    'metadata',
    SETTINGS_ID,
  );

  if (!record) {
    return {} as FarmSettings;
  }

  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...settings } =
    record;

  return settings;
}

export async function updateFarmSettings(
  input: FarmSettings,
): Promise<FarmSettings> {
  const saved = await saveRecord<FarmSettingsRecord>('metadata', {
    ...input,
    id: SETTINGS_ID,
  });

  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...settings } =
    saved;

  return settings;
}
