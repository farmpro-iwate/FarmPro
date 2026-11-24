import type { MarketCatalogEntry, MarketResultPeriod } from './marketCatalog';

/**
 * Input contract for an approved official-source adapter.
 * This does NOT scrape or fetch external websites. The source-specific parser
 * must validate the provider's actual schema before creating this object.
 */
export type MarketResultInput = {
  marketId: string;
  periodStart: string;
  periodEnd: string;
  publishedAt: string;
  sourceUrl: string;
  breed: string;
  sex: MarketResultPeriod['sex'];
  headCount: number | null;
  averagePriceYen: number | null;
  priceIncludesTax: boolean | null;
  status: MarketResultPeriod['status'];
};

export type ResultValidation =
  | { ok: true; result: MarketResultPeriod }
  | { ok: false; reason: string };

function isCalendarDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() + 1 === m && parsed.getUTCDate() === d;
}

export function validateMarketResult(
  input: MarketResultInput,
  catalog: readonly MarketCatalogEntry[],
): ResultValidation {
  const market = catalog.find(m => m.id === input.marketId && m.active);
  if (!market) return { ok: false, reason: '未確認の市場IDです' };
  if (!isCalendarDate(input.periodStart) || !isCalendarDate(input.periodEnd) ||
      input.periodEnd < input.periodStart) {
    return { ok: false, reason: '開催期間が不正です' };
  }
  if (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(input.publishedAt) ||
      !Number.isFinite(Date.parse(input.publishedAt))) {
    return { ok: false, reason: '公表日が不正です' };
  }
  let provider: URL;
  let supplied: URL;
  try {
    provider = new URL(market.sourceUrl);
    supplied = new URL(input.sourceUrl);
  } catch { return { ok: false, reason: '出典URLが不正です' }; }
  if (provider.protocol !== 'https:' || supplied.protocol !== 'https:' ||
      provider.hostname !== supplied.hostname ||
      (provider.port || '') !== (supplied.port || '')) {
    return { ok: false, reason: '確認済みの出典と一致しません' };
  }
  if (!input.breed.trim() || !['female', 'castrated', 'male', 'unknown'].includes(input.sex)) {
    return { ok: false, reason: '品種または性別が不正です' };
  }
  if (input.headCount !== null &&
      (!Number.isSafeInteger(input.headCount) || input.headCount < 0)) {
    return { ok: false, reason: '取引頭数が不正です' };
  }
  if (input.averagePriceYen !== null &&
      (!Number.isSafeInteger(input.averagePriceYen) || input.averagePriceYen < 0)) {
    return { ok: false, reason: '平均価格が不正です' };
  }
  if (input.priceIncludesTax !== null && typeof input.priceIncludesTax !== 'boolean') {
    return { ok: false, reason: '税込区分が不正です' };
  }
  if (!['preliminary', 'final'].includes(input.status)) {
    return { ok: false, reason: '公表状態が不正です' };
  }
  return { ok: true, result: { ...input, breed: input.breed.trim() } };
}

/** Unique by official source, market, period, breed and sex. */
export function marketResultKey(value: MarketResultPeriod): string {
  return JSON.stringify([
    value.sourceUrl, value.marketId, value.periodStart, value.periodEnd,
    value.breed, value.sex, value.status, value.publishedAt,
  ]);
}

/** Returns only source-verified, changed results; existing values are never mutated. */
export function changedMarketResults(
  previous: readonly MarketResultPeriod[],
  next: readonly MarketResultPeriod[],
): MarketResultPeriod[] {
  const keys = new Set(previous.map(marketResultKey));
  return next.filter(item => !keys.has(marketResultKey(item)));
}
