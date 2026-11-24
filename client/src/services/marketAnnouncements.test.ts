import { describe, expect, it } from 'vitest';
import { markMarketAnnouncementsRead, synchronizeMarketAnnouncements } from './marketAnnouncements';
import type { MarketCatalogEntry, MarketResultPeriod } from './marketCatalog';
const catalog: MarketCatalogEntry[] = [{
  id: 'test', prefecture: '岩手県', name: '検証市場', aliases: [],
  source: 'market-organizer', sourceUrl: 'https://example.org/results',
  verifiedAt: '2026-11-24', active: true
}];
const watch = [{ prefecture: '岩手県', name: '検証市場', notify: true }];
const item: MarketResultPeriod = {
  marketId: 'test', periodStart: '2026-10-01', periodEnd: '2026-10-31',
  publishedAt: '2026-11-20', sourceUrl: 'https://example.org/results',
  breed: '黒毛和種', sex: 'female', headCount: 8, averagePriceYen: 700000,
  priceIncludesTax: true, status: 'final'
};
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v); }
  };
}
describe('in-app market announcements', () => {
  it('treats first view as baseline and never alerts historical results', () => {
    const storage = fakeStorage();
    const first = synchronizeMarketAnnouncements(storage, [item], watch, catalog);
    expect(first.firstObservation).toBe(true);
    expect(first.announcements).toEqual([]);
    expect(synchronizeMarketAnnouncements(storage, [item], watch, catalog).announcements).toEqual([]);
  });
  it('displays new period once and can mark it read', () => {
    const storage = fakeStorage();
    synchronizeMarketAnnouncements(storage, [item], watch, catalog);
    const next = { ...item, periodStart: '2026-11-01', periodEnd: '2026-11-30', publishedAt: '2026-12-20' };
    const first = synchronizeMarketAnnouncements(storage, [item, next], watch, catalog);
    expect(first.announcements).toMatchObject([{ kind: 'new-period', read: false }]);
    expect(synchronizeMarketAnnouncements(storage, [item, next], watch, catalog).announcements).toHaveLength(1);
    expect(markMarketAnnouncementsRead(storage)).toMatchObject([{ read: true }]);
  });
  it('respects opt-out and refuses unverified source data', () => {
    const storage = fakeStorage();
    synchronizeMarketAnnouncements(storage, [item], watch, catalog);
    const next = { ...item, periodStart: '2026-11-01', periodEnd: '2026-11-30', publishedAt: '2026-12-20' };
    expect(synchronizeMarketAnnouncements(storage, [item, next], [{ ...watch[0], notify: false }], catalog).announcements).toEqual([]);
    const unsafe = { ...item, periodStart: '2026-12-01', periodEnd: '2026-12-31', sourceUrl: 'https://unknown.example.org' };
    expect(synchronizeMarketAnnouncements(storage, [item, next, unsafe], watch, catalog).announcements).toEqual([]);
  });
});
