import type { MarketCatalogEntry, MarketResultPeriod } from './marketCatalog';
import { validateMarketResult } from './marketResultsValidation';

type FeedDocument = { schemaVersion: number; updatedAt: string; results: unknown };

export function parseMarketFeed(payload: unknown, catalog: readonly MarketCatalogEntry[]): MarketResultPeriod[] {
  if (!payload || typeof payload !== 'object') throw new Error('市場結果の形式が不正です');
  const doc = payload as FeedDocument;
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.results) ||
      typeof doc.updatedAt !== 'string' || !Number.isFinite(Date.parse(doc.updatedAt))) {
    throw new Error('市場結果のバージョンまたは更新日時が不正です');
  }
  const results: MarketResultPeriod[] = [];
  for (const raw of doc.results) {
    if (!raw || typeof raw !== 'object') throw new Error('市場結果の項目が不正です');
    const candidate = raw as MarketResultPeriod;
    const checked = validateMarketResult(candidate, catalog);
    if (!checked.ok) throw new Error(checked.reason);
    results.push(checked.result);
  }
  return results;
}

/** Fetches only the app-hosted reviewed JSON. This does NOT scrape any outside provider. */
export async function loadPublishedMarketFeed(
  catalog: readonly MarketCatalogEntry[],
  fetcher: typeof fetch = fetch,
): Promise<MarketResultPeriod[]> {
  const url = `${import.meta.env.BASE_URL}market-results/feed.json`;
  const response = await fetcher(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('公開済み市場情報を取得できません');
  return parseMarketFeed(await response.json(), catalog);
}
