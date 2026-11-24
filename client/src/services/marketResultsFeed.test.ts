import { describe, expect, it, vi } from 'vitest';
import { verifiedMarketCatalog } from './marketCatalog';
import { loadPublishedMarketFeed, parseMarketFeed } from './marketResultsFeed';
import { publishedMarketResultSnapshot } from './marketResultsPublishedSnapshot';

const document = {
  schemaVersion: 1,
  updatedAt: '2026-11-20',
  results: publishedMarketResultSnapshot,
};
describe('published market feed', () => {
  it('parses a source-validated feed without changing its records', () => {
    expect(parseMarketFeed(document, verifiedMarketCatalog)).toEqual(publishedMarketResultSnapshot);
  });
  it('rejects unknown market, unverified source and malformed version', () => {
    expect(() => parseMarketFeed({ ...document, schemaVersion: 2 }, verifiedMarketCatalog)).toThrow();
    expect(() => parseMarketFeed({ ...document, results: [{ ...publishedMarketResultSnapshot[0], marketId: 'unknown' }] }, verifiedMarketCatalog)).toThrow();
    expect(() => parseMarketFeed({ ...document, results: [{ ...publishedMarketResultSnapshot[0], sourceUrl: 'https://example.com/result' }] }, verifiedMarketCatalog)).toThrow();
  });
  it('loads only the app-hosted feed path', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => document });
    expect(await loadPublishedMarketFeed(verifiedMarketCatalog, fetcher)).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toMatch(/market-results\/feed\.json$/);
    expect(fetcher.mock.calls[0][1]).toEqual({ cache: 'no-store' });
  });
});
