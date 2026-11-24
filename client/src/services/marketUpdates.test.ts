import { describe, expect, it } from 'vitest';
import { detectMarketUpdates } from './marketUpdates';
import type { MarketCatalogEntry, MarketResultPeriod } from './marketCatalog';

const catalog: MarketCatalogEntry[] = [{
  id: 'test-market', prefecture: '岩手県', name: '検証用市場', aliases: [],
  source: 'market-organizer', sourceUrl: 'https://example.org/market',
  verifiedAt: '2026-11-24', active: true,
}];
const watch = [{ prefecture: '岩手県', name: '検証用市場', notify: true }];
const value: MarketResultPeriod = {
  marketId: 'test-market', periodStart: '2026-11-01', periodEnd: '2026-11-30',
  publishedAt: '2026-12-01', sourceUrl: 'https://example.org/market/report',
  breed: '黒毛和種', sex: 'female', headCount: 15,
  averagePriceYen: 600000, priceIncludesTax: true, status: 'final'
};

describe('market result update detector', () => {
  it('does not notify historical records during initial baseline', () => {
    expect(detectMarketUpdates([], [value], watch, catalog, true)).toEqual([]);
  });
  it('recognizes a new published period and ignores identical refresh', () => {
    expect(detectMarketUpdates([], [value], watch, catalog)).toMatchObject([{ kind: 'new-period' }]);
    expect(detectMarketUpdates([value], [value], watch, catalog)).toEqual([]);
  });
  it('recognizes a corrected price and rejects older reports', () => {
    const correction = { ...value, publishedAt: '2026-12-03', averagePriceYen: 610000 };
    expect(detectMarketUpdates([value], [correction], watch, catalog)).toMatchObject([{ kind: 'revision' }]);
    expect(detectMarketUpdates([correction], [value], watch, catalog)).toEqual([]);
  });
  it('respects notification opt-out, verified market ID and source', () => {
    expect(detectMarketUpdates([], [value], [{ ...watch[0], notify: false }], catalog)).toEqual([]);
    expect(detectMarketUpdates([], [value], watch, [])).toEqual([]);
    expect(detectMarketUpdates([], [{ ...value, sourceUrl: 'https://unverified.org/report' }], watch, catalog)).toEqual([]);
  });
  it('retains separate female and male events without duplicate notifications', () => {
    const male = { ...value, sex: 'male' as const };
    const updates = detectMarketUpdates([], [value, value, male], watch, catalog);
    expect(updates).toHaveLength(2);
    expect(updates.map(item => item.sex).sort()).toEqual(['female', 'male']);
  });
});
