import { lifecycleLock, runtimeRoot, strictRead, atomicWrite, withdrawalCompletions } from './accountLifecycle';
import { safeId } from './accountLifecycle';

export type MarketWatch = { prefecture: string; name: string; notify: boolean };
export type StoredMarketWatchlist = {
  revision: number;
  updatedAt: string;
  markets: MarketWatch[];
};
type Store = { version: 1; items: Record<string, StoredMarketWatchlist> };
const FILE = 'market-watchlists-v1.json';
const EMPTY: StoredMarketWatchlist = { revision: 0, updatedAt: '', markets: [] };
const PREFECTURES = new Set('北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' '));

function key(farmId: string, userId: string) {
  if (!safeId(farmId) || !safeId(userId)) throw new Error('INVALID_MARKET_IDENTITY');
  return farmId + ':' + userId;
}
function validateMarkets(value: unknown): MarketWatch[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error('INVALID_MARKET_WATCHLIST');
  const seen = new Set<string>();
  return value.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('INVALID_MARKET_WATCHLIST');
    const item = row as Record<string, unknown>;
    if (typeof item.prefecture !== 'string' || !PREFECTURES.has(item.prefecture) ||
      typeof item.name !== 'string' || item.name !== item.name.trim() || item.name.length < 1 ||
      item.name.length > 80 || typeof item.notify !== 'boolean') throw new Error('INVALID_MARKET_WATCHLIST');
    const normalized = item.name.normalize('NFKC');
    const identity = item.prefecture + '\\0' + normalized;
    if (seen.has(identity)) throw new Error('DUPLICATE_MARKET_WATCH');
    seen.add(identity);
    return { prefecture: item.prefecture, name: item.name, notify: item.notify };
  });
}
async function readStore(root: string): Promise<Store> {
  const data = await strictRead(root, FILE, true);
  if (data === undefined) return { version: 1, items: {} };
  if (data?.version !== 1 || !data.items || typeof data.items !== 'object' || Array.isArray(data.items))
    throw new Error('INVALID_MARKET_STORE');
  return data as Store;
}
function copy(record?: StoredMarketWatchlist): StoredMarketWatchlist {
  return record ? { revision: record.revision, updatedAt: record.updatedAt, markets: record.markets.map(m => ({ ...m })) } : { ...EMPTY, markets: [] };
}
export async function getMarketWatchlist(farmId: string, userId: string) {
  const entryKey = key(farmId, userId);
  const store = await readStore(runtimeRoot());
  return copy(store.items[entryKey]);
}
export async function updateMarketWatchlist(
  farmId: string, userId: string, baseRevision: number, input: unknown,
): Promise<{ status: 'saved' | 'conflict'; value: StoredMarketWatchlist }> {
  const entryKey = key(farmId, userId);
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) throw new Error('INVALID_MARKET_REVISION');
  const markets = validateMarkets(input);
  return lifecycleLock(async root => {
    const store = await readStore(root);
    const current = copy(store.items[entryKey]);
    if (current.revision !== baseRevision) return { status: 'conflict', value: current };
    // Do not revive a watchlist for an account that is being withdrawn.
    const withdrawn = await withdrawalCompletions(root);
    if (withdrawn.some(row => row.userId === userId || row.farmId === farmId))
      throw new Error('MARKET_ACCOUNT_WITHDRAWN');
    const next: StoredMarketWatchlist = {
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      markets,
    };
    store.items[entryKey] = next;
    await atomicWrite(root, FILE, store);
    return { status: 'saved', value: copy(next) };
  });
}

export async function listMarketNotificationPreferences(): Promise<Array<{
  farmId: string; userId: string; markets: MarketWatch[];
}>> {
  const store = await readStore(runtimeRoot());
  const entries: Array<{farmId:string;userId:string;markets:MarketWatch[]}> = [];
  for (const [owner, watchlist] of Object.entries(store.items)) {
    const split = owner.indexOf(':');
    if (split < 1 || !Array.isArray(watchlist.markets)) continue;
    const farmId = owner.slice(0, split), userId = owner.slice(split + 1);
    if (!safeId(farmId) || !safeId(userId)) continue;
    entries.push({ farmId, userId, markets: watchlist.markets.filter(row => row.notify) });
  }
  return entries;
}
