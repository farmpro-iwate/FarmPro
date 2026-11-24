import type { MarketCatalogEntry, MarketResultPeriod } from './marketCatalog';
import { detectMarketUpdates, type WatchedMarket } from './marketUpdates';
import { validateMarketResult } from './marketResultsValidation';

const KEY = 'farmpro.market-announcements.v1';
export type MarketAnnouncement = {
  id: string;
  marketId: string;
  periodEnd: string;
  sex: MarketResultPeriod['sex'];
  kind: 'new-period' | 'revision';
  read: boolean;
};
type State = { observed: MarketResultPeriod[]; announcements: MarketAnnouncement[] };

function parseState(raw: string | null): State | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const data = parsed as Record<string, unknown>;
    if (!Array.isArray(data.observed) || !Array.isArray(data.announcements)) return null;
    if (!data.announcements.every((a: unknown) => {
      const item = a as MarketAnnouncement | null;
      return !!item && typeof item.id === 'string' && typeof item.read === 'boolean' &&
        typeof item.marketId === 'string' && typeof item.periodEnd === 'string';
    })) return null;
    return { observed: data.observed as MarketResultPeriod[], announcements: data.announcements as MarketAnnouncement[] };
  } catch { return null; }
}

export function synchronizeMarketAnnouncements(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  current: readonly MarketResultPeriod[],
  watched: readonly WatchedMarket[],
  catalog: readonly MarketCatalogEntry[],
): { announcements: MarketAnnouncement[]; firstObservation: boolean } {
  const old = parseState(storage.getItem(KEY));
  const validated = current.filter(result => validateMarketResult(result, catalog).ok);
  const updates = detectMarketUpdates(old?.observed ?? [], validated, watched, catalog, old === null);
  const known = new Set((old?.announcements ?? []).map(item => item.id));
  const fresh = updates.map(item => ({
    id: JSON.stringify([item.current.marketId, item.current.periodStart, item.current.periodEnd,
      item.current.breed, item.current.sex, item.current.publishedAt, item.current.status,
      item.current.headCount, item.current.averagePriceYen]),
    marketId: item.marketId,
    periodEnd: item.periodEnd,
    sex: item.sex,
    kind: item.kind,
    read: false,
  } satisfies MarketAnnouncement)).filter(item => !known.has(item.id));
  const announcements = [...fresh, ...(old?.announcements ?? [])].slice(0, 100);
  // Store in a separate key; never write to FarmPro's IndexedDB, sales or sync data.
  storage.setItem(KEY, JSON.stringify({ observed: validated, announcements }));
  return { announcements, firstObservation: old === null };
}

export function markMarketAnnouncementsRead(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): MarketAnnouncement[] {
  const state = parseState(storage.getItem(KEY));
  if (!state) return [];
  const announcements = state.announcements.map(item => ({ ...item, read: true }));
  storage.setItem(KEY, JSON.stringify({ ...state, announcements }));
  return announcements;
}
