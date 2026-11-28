import { getAuthToken, getStoredAuthUser } from './authClient';
import type { FarmProPlanId } from '../plans/policy';

export type WatchedMarket = { prefecture: string; name: string; notify: boolean };
export type MarketWatchlistCloud = { revision: number; updatedAt: string; markets: WatchedMarket[] };
export class MarketWatchlistConflict extends Error {
  constructor(readonly latest: MarketWatchlistCloud) { super('別の端末で市場選択が更新されました。再読み込みしてから変更してください。'); }
}
export function canSyncMarketWatchlist(plan: FarmProPlanId | undefined) {
  return plan === 'standard' || plan === 'pro';
}
export function isMarketSyncEnabled() {
  return canSyncMarketWatchlist(getStoredAuthUser()?.plan);
}
function headers() {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');
  return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
}
function validateResponse(value: unknown): MarketWatchlistCloud {
  if (!value || typeof value !== 'object') throw new Error('市場の同期データが不正です');
  const data = value as Partial<MarketWatchlistCloud>;
  if (!Number.isSafeInteger(data.revision) || (data.revision ?? -1) < 0 || !Array.isArray(data.markets) || typeof data.updatedAt !== 'string')
    throw new Error('市場の同期データが不正です');
  return data as MarketWatchlistCloud;
}
export async function fetchMarketWatchlistCloud(): Promise<MarketWatchlistCloud> {
  const response = await fetch('/api/market-watchlists', { headers: headers(), cache: 'no-store' });
  if (!response.ok) throw new Error('市場の同期データを読み込めませんでした（' + response.status + '）');
  return validateResponse(await response.json());
}
export async function saveMarketWatchlistCloud(baseRevision: number, markets: WatchedMarket[]) {
  const response = await fetch('/api/market-watchlists', {
    method: 'PUT', headers: headers(), cache: 'no-store',
    body: JSON.stringify({ baseRevision, markets }),
  });
  if (response.status === 409) {
    const latest = validateResponse(await response.json());
    throw new MarketWatchlistConflict(latest);
  }
  if (!response.ok) throw new Error('市場の同期データを保存できませんでした（' + response.status + '）');
  return validateResponse(await response.json());
}
