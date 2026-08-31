import { FarmSettings } from '../types/settings';
import { getFarmProPlan } from '../plans/policy';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getRecordById, saveRecord } from '../storage/repository';
import { getStoredAuthUser, updateAccountProfile, type AuthUser } from './authClient';
import { fetchFarmSettingsFromCloud, saveFarmSettingsToCloud } from './farmSettingsCloudApi';

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

function stripRecordMeta(record: FarmSettingsRecord): FarmSettings {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    cloudUpdatedAt: _cloudUpdatedAt,
    ...settings
  } = record;
  return settings;
}

function hasInitializedCloudSettings(cloud: {
  farmName: string;
  ownerName: string;
  staffName: string;
  phone: string;
  address: string;
  estrousCycleDays: number;
  bullMasters: string[];
  supplierMasters: string[];
  memo: string;
}) {
  return Boolean(
    cloud.farmName.trim() ||
    cloud.ownerName.trim() ||
    cloud.staffName.trim() ||
    cloud.phone.trim() ||
    cloud.address.trim() ||
    cloud.memo.trim() ||
    cloud.bullMasters.length ||
    cloud.supplierMasters.length ||
    Number(cloud.estrousCycleDays) !== 21
  );
}

export async function getFarmSettings(): Promise<FarmSettings> {
  const record = await getRecordById<FarmSettingsRecord>(
    'metadata',
    SETTINGS_ID,
  );

  if (!record) {
    return {} as FarmSettings;
  }

  return stripRecordMeta(record);
}

export async function getFarmSettingsForPageOpen(): Promise<FarmSettings> {
  const localRecord = await getRecordById<FarmSettingsRecord>('metadata', SETTINGS_ID);

  if (!shouldUseCloudSync()) {
    return localRecord ? stripRecordMeta(localRecord) : {} as FarmSettings;
  }

  try {
    const cloud = await fetchFarmSettingsFromCloud();
    if (hasInitializedCloudSettings(cloud)) {
      const saved = await saveRecord<FarmSettingsRecord>('metadata', {
        id: SETTINGS_ID,
        farmName: cloud.farmName,
        ownerName: cloud.ownerName,
        staffName: cloud.staffName,
        phone: cloud.phone,
        address: cloud.address,
        estrousCycleDays: Number(cloud.estrousCycleDays) || 21,
        bullMasters: Array.isArray(cloud.bullMasters) ? cloud.bullMasters : [],
        supplierMasters: Array.isArray(cloud.supplierMasters) ? cloud.supplierMasters : [],
        memo: cloud.memo,
        cloudUpdatedAt: cloud.cloudUpdatedAt,
      });
      return stripRecordMeta(saved);
    }
  } catch (error) {
    console.warn('農場設定のクラウド取り込みをスキップしました。', error);
  }

  return localRecord ? stripRecordMeta(localRecord) : {} as FarmSettings;
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
  return stripRecordMeta(saved);
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

  return stripRecordMeta(saved);
}
