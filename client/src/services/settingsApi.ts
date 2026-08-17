import { FarmSettings } from '../types/settings';
import { getRecordById, saveRecord } from '../storage/repository';
import { getStoredAuthUser, updateAccountProfile, type AuthUser } from './authClient';

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

export async function syncAccountToFarmSettings(userInput?: AuthUser | null): Promise<FarmSettings> {
  const user = userInput ?? getStoredAuthUser();
  const current = await getFarmSettings();
  if (!user) return current;

  const merged: FarmSettings = {
    ...current,
    farmName: user.farmName || current.farmName || '',
    ownerName: user.name || current.ownerName || '',
  };

  const saved = await saveRecord<FarmSettingsRecord>('metadata', {
    ...merged,
    id: SETTINGS_ID,
  });
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...settings } = saved;
  return settings;
}

export async function updateFarmSettings(
  input: FarmSettings,
): Promise<FarmSettings> {
  const authUser = getStoredAuthUser();
  const farmName = input.farmName?.trim() || '';
  const ownerName = input.ownerName?.trim() || '';

  if (authUser && farmName && ownerName && (authUser.farmName !== farmName || authUser.name !== ownerName)) {
    await updateAccountProfile({ farmName, name: ownerName });
  }

  const saved = await saveRecord<FarmSettingsRecord>('metadata', {
    ...input,
    id: SETTINGS_ID,
  });

  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...settings } =
    saved;

  return settings;
}
