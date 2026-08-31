import { readJson, writeJson } from './jsonStore';

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

const fileName = 'market-shipping-plan-settings.json';

const defaultSettings: MarketShippingPlanSettings = {
  fiscalYear: '',
  minAgeDays: 260,
  maxAgeDays: 310,
  schedules: [],
};

function normalizeSettings(
  input: Partial<MarketShippingPlanSettings>,
  existing?: MarketShippingPlanSettings,
): MarketShippingPlanSettings {
  const now = new Date().toISOString();

  return {
    fiscalYear: String(input.fiscalYear ?? existing?.fiscalYear ?? '').trim(),
    minAgeDays: Number(input.minAgeDays ?? existing?.minAgeDays ?? 260),
    maxAgeDays: Number(input.maxAgeDays ?? existing?.maxAgeDays ?? 310),
    schedules: Array.isArray(input.schedules)
      ? input.schedules.map((schedule) => ({
          id: String(schedule.id || ''),
          marketName: String(schedule.marketName || '').trim(),
          marketDate: String(schedule.marketDate || ''),
        }))
      : existing?.schedules ?? [],
    cloudUpdatedAt: input.cloudUpdatedAt ?? existing?.cloudUpdatedAt ?? now,
  };
}

export async function getMarketShippingPlanSettings() {
  const saved = await readJson<MarketShippingPlanSettings>(fileName, defaultSettings);
  return normalizeSettings(saved, saved);
}

export async function saveMarketShippingPlanSettings(
  input: MarketShippingPlanSettings,
) {
  const existing = await readJson<MarketShippingPlanSettings>(fileName, defaultSettings);
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
