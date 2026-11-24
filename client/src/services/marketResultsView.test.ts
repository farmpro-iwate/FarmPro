import { describe, expect, it } from 'vitest';
import { formatPublishedPrice, getSelectedMarketResult } from './marketResultsView';
import type { MarketCatalogEntry, MarketResultPeriod } from './marketCatalog';
const market: MarketCatalogEntry = {
  id: 'verified-1', prefecture: '岩手県', name: '架空の検証用市場', aliases: [],
  source: 'market-organizer', sourceUrl: 'https://example.org/results',
  verifiedAt: '2026-11-24', active: true,
};
const result: MarketResultPeriod = {
  marketId: market.id, periodStart: '2026-11-01', periodEnd: '2026-11-03',
  publishedAt: '2026-11-04', sourceUrl: market.sourceUrl,
  breed: '黒毛和種', sex: 'castrated', headCount: 10,
  averagePriceYen: 650000, priceIncludesTax: true, status: 'final',
};
describe('market result presentation', () => {
  it('does not invent prices for an unverified selection', () => {
    expect(getSelectedMarketResult({ prefecture: '岩手県', name: market.name }, [], [result]).status).toBe('market-unverified');
  });
  it('displays unpublished for a verified market without data', () => {
    const view = getSelectedMarketResult({ prefecture: '岩手県', name: market.name }, [market], []);
    expect(view.status).toBe('unpublished');
    expect(view.latest).toBeNull();
  });
  it('chooses the latest available published period', () => {
    const older = { ...result, periodStart: '2026-10-01', periodEnd: '2026-10-03' };
    const view = getSelectedMarketResult({ prefecture: '岩手県', name: market.name }, [market], [older, result]);
    expect(view.latest).toEqual(result);
  });
  it('shows missing prices without assuming tax treatment', () => {
    expect(formatPublishedPrice(null, null)).toBe('未公表');
    expect(formatPublishedPrice(650000, true)).toBe('650,000円（税込）');
    expect(formatPublishedPrice(650000, null)).toBe('650,000円（税区分不明）');
  });
});
