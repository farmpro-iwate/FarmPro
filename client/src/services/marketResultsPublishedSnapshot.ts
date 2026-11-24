import type { MarketResultPeriod } from './marketCatalog';

/**
 * Source-attributed, static published monthly figures for one market.
 * A snapshot is not a live feed. Values are quoted from ALIC's monthly
 * black Wagyu report (market classification: all markets), 2026 October.
 * The official "雄" category is retained as male, NOT presumed castrated.
 * ALIC's published prices are tax-inclusive.
 */
const sourceUrl = 'https://www.alic.go.jp/n-jigyo/koushigeppou/koushi01kuro.pdf';
const common = {
  marketId: 'alic-iwate-kennan',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  publishedAt: '2026-11-20',
  sourceUrl,
  breed: '黒毛和種',
  priceIncludesTax: true,
  status: 'final' as const
};
export const publishedMarketResultSnapshot: readonly MarketResultPeriod[] = Object.freeze([
  { ...common, sex: 'female', headCount: 139, averagePriceYen: 794794 },
  { ...common, sex: 'male', headCount: 195, averagePriceYen: 884829 },
]);
