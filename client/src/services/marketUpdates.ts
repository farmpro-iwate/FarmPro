import type { MarketCatalogEntry, MarketResultPeriod } from './marketCatalog';
import { findVerifiedMarket } from './marketCatalog';
import { validateMarketResult } from './marketResultsValidation';

export type WatchedMarket = { prefecture: string; name: string; notify: boolean };
export type MarketUpdate = {
  kind: 'new-period' | 'revision';
  marketId: string;
  periodStart: string;
  periodEnd: string;
  breed: string;
  sex: MarketResultPeriod['sex'];
  current: MarketResultPeriod;
  previous: MarketResultPeriod | null;
};

function observationKey(result: MarketResultPeriod): string {
  return JSON.stringify([result.marketId, result.periodStart, result.periodEnd, result.breed, result.sex]);
}

function revisionKey(result: MarketResultPeriod): string {
  return JSON.stringify([
    result.publishedAt, result.status, result.headCount, result.averagePriceYen,
    result.priceIncludesTax, result.sourceUrl,
  ]);
}

/**
 * Identify updates for a user's opted-in and officially resolved markets.
 * The caller must provide the previously observed validated dataset. On first
 * observation, pass baselineMode=true to avoid alerting on historical reports.
 * No side effects, network calls, subscriptions or existing FarmPro writes.
 */
export function detectMarketUpdates(
  previous: readonly MarketResultPeriod[],
  current: readonly MarketResultPeriod[],
  watched: readonly WatchedMarket[],
  catalog: readonly MarketCatalogEntry[],
  baselineMode = false,
): MarketUpdate[] {
  if (baselineMode) return [];
  const watchedIds = new Set(
    watched.filter(item => item.notify)
      .map(item => findVerifiedMarket(catalog, item.prefecture, item.name)?.id)
      .filter((id): id is string => Boolean(id)),
  );

  const oldMap = new Map<string, MarketResultPeriod>();
  for (const result of previous) {
    if (!validateMarketResult(result, catalog).ok) continue;
    const key = observationKey(result);
    const existing = oldMap.get(key);
    if (!existing || existing.publishedAt < result.publishedAt) oldMap.set(key, result);
  }

  const updates: MarketUpdate[] = [];
  const newMap = new Map<string, MarketResultPeriod>();
  for (const result of current) {
    if (!watchedIds.has(result.marketId) || !validateMarketResult(result, catalog).ok) continue;
    const key = observationKey(result);
    const existing = newMap.get(key);
    if (!existing || existing.publishedAt < result.publishedAt) newMap.set(key, result);
  }
  for (const [key, result] of newMap) {
    const old = oldMap.get(key) ?? null;
    if (old && (result.publishedAt < old.publishedAt ||
      (result.publishedAt === old.publishedAt && revisionKey(result) === revisionKey(old)))) continue;
    updates.push({
      kind: old ? 'revision' : 'new-period',
      marketId: result.marketId,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      breed: result.breed,
      sex: result.sex,
      current: result,
      previous: old,
    });
  }
  return updates.sort((a, b) =>
    b.periodEnd.localeCompare(a.periodEnd) || a.marketId.localeCompare(b.marketId) ||
    a.sex.localeCompare(b.sex)
  );
}
