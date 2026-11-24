import type { MarketCatalogEntry, MarketResultPeriod } from './marketCatalog';
import { findVerifiedMarket } from './marketCatalog';
import { validateMarketResult } from './marketResultsValidation';

export type MarketWatchSelection = { prefecture: string; name: string };
export type MarketResultView = {
  marketId: string | null;
  status: 'market-unverified' | 'unpublished' | 'published';
  latest: MarketResultPeriod | null;
  latestBySex: MarketResultPeriod[];
};

export function getSelectedMarketResult(
  selected: MarketWatchSelection,
  catalog: readonly MarketCatalogEntry[],
  results: readonly MarketResultPeriod[]
): MarketResultView {
  const market = findVerifiedMarket(catalog, selected.prefecture, selected.name);
  if (!market) return { marketId: null, status: 'market-unverified', latest: null, latestBySex: [] };
  const candidates = results
    .filter(result => result.marketId === market.id && validateMarketResult(result, catalog).ok)
    .sort((a, b) =>
      b.periodEnd.localeCompare(a.periodEnd) ||
      b.publishedAt.localeCompare(a.publishedAt)
    );
  if (!candidates.length) return { marketId: market.id, status: 'unpublished', latest: null };
  const currentPeriod = candidates.filter(result =>
    result.periodStart === candidates[0].periodStart && result.periodEnd === candidates[0].periodEnd
  );
  const latestBySex = currentPeriod.filter((result, index, all) =>
    all.findIndex(candidate => candidate.sex === result.sex && candidate.breed === result.breed) === index
  );
  return { marketId: market.id, status: 'published', latest: candidates[0], latestBySex };
}

export function formatPublishedPrice(price: number | null, includesTax: boolean | null): string {
  if (price === null) return '未公表';
  const tax = includesTax === null ? '税区分不明' : includesTax ? '税込' : '税抜';
  return `${price.toLocaleString('ja-JP')}円（${tax}）`;
}
