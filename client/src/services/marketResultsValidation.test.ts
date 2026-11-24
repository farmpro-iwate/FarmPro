import { describe, expect, it } from 'vitest';
import { changedMarketResults, validateMarketResult } from './marketResultsValidation';
import type { MarketCatalogEntry, MarketResultPeriod } from './marketCatalog';

const market: MarketCatalogEntry = {
  id: 'test-market', prefecture: '岩手県', name: '検証用市場', aliases: [],
  source: 'market-organizer', sourceUrl: 'https://example.org/markets/',
  verifiedAt: '2026-11-24', active: true,
};
const input = {
  marketId: market.id, periodStart: '2026-11-01', periodEnd: '2026-11-03',
  publishedAt: '2026-11-05', sourceUrl: 'https://example.org/markets/results',
  breed: '黒毛和種', sex: 'castrated' as const, headCount: 10, averagePriceYen: 650000,
  priceIncludesTax: true, status: 'final' as const,
};
describe('market result validation', () => {
  it('accepts a result from a verified market and source', () => {
    expect(validateMarketResult(input, [market]).ok).toBe(true);
  });
  it('rejects unknown markets, fake sources and invalid period/price', () => {
    expect(validateMarketResult(input, []).ok).toBe(false);
    expect(validateMarketResult({ ...input, sourceUrl: 'https://other.example.org/' }, [market]).ok).toBe(false);
    expect(validateMarketResult({ ...input, periodEnd: '2026-10-01' }, [market]).ok).toBe(false);
    expect(validateMarketResult({ ...input, periodStart: '2026-02-30' }, [market]).ok).toBe(false);
    expect(validateMarketResult({ ...input, averagePriceYen: -1 }, [market]).ok).toBe(false);
  });
  it('deduplicates identical publications without mutating old results', () => {
    const validated = validateMarketResult(input, [market]);
    if (!validated.ok) throw new Error(validated.reason);
    const result: MarketResultPeriod = validated.result;
    expect(changedMarketResults([result], [result])).toEqual([]);
    const changed = { ...result, publishedAt: '2026-11-06' };
    expect(changedMarketResults([result], [changed])).toEqual([changed]);
    expect(result.publishedAt).toBe('2026-11-05');
  });
});
