import { readJson, writeJson } from './jsonStore';

export type FarmTaxRate = '10' | '8' | '0';
export type FarmExpenseAllocation = 'none' | 'equal';
export type FarmExpenseAllocationTarget = 'all' | 'cattle' | 'calf';
export type FarmExpenseAllocationPeriod = 'monthly' | 'yearly';

export type FarmSettingsCloudRecord = {
  farmName: string;
  ownerName: string;
  staffName: string;
  phone: string;
  address: string;
  estrousCycleDays: number;
  defaultTaxRate: FarmTaxRate;
  farmExpenseAllocation: FarmExpenseAllocation;
  farmExpenseAllocationTarget: FarmExpenseAllocationTarget;
  farmExpenseAllocationPeriod: FarmExpenseAllocationPeriod;
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
  defaultTaxRate: '10',
  farmExpenseAllocation: 'none',
  farmExpenseAllocationTarget: 'all',
  farmExpenseAllocationPeriod: 'monthly',
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

function normalizeTaxRate(value: unknown, fallback: FarmTaxRate = '10'): FarmTaxRate {
  if (value === '10' || value === '8' || value === '0') return value;
  return fallback;
}

function normalizeFarmExpenseAllocation(
  value: unknown,
  fallback: FarmExpenseAllocation = 'none',
): FarmExpenseAllocation {
  if (value === 'equal' || value === 'none') return value;
  return fallback;
}

function normalizeFarmExpenseAllocationTarget(
  value: unknown,
  fallback: FarmExpenseAllocationTarget = 'all',
): FarmExpenseAllocationTarget {
  if (value === 'all' || value === 'cattle' || value === 'calf') return value;
  return fallback;
}

function normalizeFarmExpenseAllocationPeriod(
  value: unknown,
  fallback: FarmExpenseAllocationPeriod = 'monthly',
): FarmExpenseAllocationPeriod {
  if (value === 'monthly' || value === 'yearly') return value;
  return fallback;
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
    defaultTaxRate: normalizeTaxRate(input.defaultTaxRate, existing?.defaultTaxRate ?? '10'),
    farmExpenseAllocation: normalizeFarmExpenseAllocation(
      input.farmExpenseAllocation,
      existing?.farmExpenseAllocation ?? 'none',
    ),
    farmExpenseAllocationTarget: normalizeFarmExpenseAllocationTarget(
      input.farmExpenseAllocationTarget,
      existing?.farmExpenseAllocationTarget ?? 'all',
    ),
    farmExpenseAllocationPeriod: normalizeFarmExpenseAllocationPeriod(
      input.farmExpenseAllocationPeriod,
      existing?.farmExpenseAllocationPeriod ?? 'monthly',
    ),
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
