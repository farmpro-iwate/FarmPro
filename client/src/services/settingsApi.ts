import { FarmSettings } from '../types/settings';
import { getFarmProPlan } from '../plans/policy';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getRecordById, saveRecord } from '../storage/repository';
import { getStoredAuthUser, updateAccountProfile, type AuthUser } from './authClient';
import { saveFarmSettingsToCloud } from './farmSettingsCloudApi';

const SETTINGS_ID = 'farm-settings';

type FarmSettingsRecord = FarmSettings & {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

export async function getFarmSettings(): Promise<FarmSettings> {
  const record = await getRecordById<FarmSettingsRecord>(
    'metadata',
    SETTINGS_ID,
  );

  if (!record) {
    return {} as FarmSettings;
  }

  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    cloudUpdatedAt: _cloudUpdatedAt,
    ...settings
  } = record;

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
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    cloudUpdatedAt: _cloudUpdatedAt,
    ...settings
  } = saved;
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

  let saved = await saveRecord<FarmSettingsRecord>('metadata', {
    ...input,
    id: SETTINGS_ID,
  });

  if (shouldUseCloudSync()) {
    try {
      const synced = await saveFarmSettingsToCloud({
        farmName: input.farmName || '',
        ownerName: input.ownerName || '',
        staffName: input.staffName || '',
        phone: input.phone || '',
        address: input.address || '',
        estrousCycleDays: Number(input.estrousCycleDays) || 21,
        bullMasters: Array.isArray(input.bullMasters) ? input.bullMasters : [],
        supplierMasters: Array.isArray(input.supplierMasters) ? input.supplierMasters : [],
        memo: input.memo || '',
      });
      saved = await saveRecord<FarmSettingsRecord>('metadata', {
        ...input,
        id: SETTINGS_ID,
        cloudUpdatedAt: synced.cloudUpdatedAt,
      });
    } catch (error) {
      console.warn('農場設定は端末内に保存しましたが、クラウド同期に失敗しました。', error);
    }
  }

  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    cloudUpdatedAt: _cloudUpdatedAt,
    ...settings
  } = saved;

  return settings;
}
