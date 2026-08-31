import { readJson, writeJson } from './jsonStore';

export type FarmSettingsCloudRecord = {
  farmName: string;
  ownerName: string;
  staffName: string;
  phone: string;
  address: string;
  estrousCycleDays: number;
  bullMasters: string[];
  supplierMasters: string[];
  memo: string;
  cloudUpdatedAt?: string;
};

const fileName = 'farm-settings.json';

const defaultSettings: FarmSettingsCloudRecord = {
  farmName: '',
  ownerName: '',
  staffName: '',
  phone: '',
  address: '',
  estrousCycleDays: 21,
  bullMasters: [],
  supplierMasters: [],
  memo: '',
};

function normalizeList(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizeSettings(
  input: Partial<FarmSettingsCloudRecord>,
  existing?: FarmSettingsCloudRecord,
): FarmSettingsCloudRecord {
  return {
    farmName: String(input.farmName ?? existing?.farmName ?? '').trim(),
    ownerName: String(input.ownerName ?? existing?.ownerName ?? '').trim(),
    staffName: String(input.staffName ?? existing?.staffName ?? '').trim(),
    phone: String(input.phone ?? existing?.phone ?? '').trim(),
    address: String(input.address ?? existing?.address ?? '').trim(),
    estrousCycleDays: Number(input.estrousCycleDays ?? existing?.estrousCycleDays ?? 21),
    bullMasters: normalizeList(input.bullMasters, existing?.bullMasters ?? []),
    supplierMasters: normalizeList(input.supplierMasters, existing?.supplierMasters ?? []),
    memo: String(input.memo ?? existing?.memo ?? ''),
    cloudUpdatedAt: input.cloudUpdatedAt ?? existing?.cloudUpdatedAt ?? new Date().toISOString(),
  };
}

export async function getFarmSettingsFromCloud() {
  const saved = await readJson<FarmSettingsCloudRecord>(fileName, defaultSettings);
  return normalizeSettings(saved, saved);
}

export async function saveFarmSettingsToCloud(
  input: FarmSettingsCloudRecord,
) {
  const existing = await readJson<FarmSettingsCloudRecord>(fileName, defaultSettings);
  const saved = normalizeSettings(
    {
      ...input,
      cloudUpdatedAt: new Date().toISOString(),
    },
    existing,
  );
  await writeJson(fileName, saved);
  return saved;
}
