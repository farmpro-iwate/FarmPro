import { lifecycleLock, runtimeRoot, strictRead, atomicWrite } from './accountLifecycle';

export type MarketResult = {
  id: string;
  sourceId: string;
  prefecture: string;
  marketName: string;
  periodStart: string;
  periodEnd: string;
  publishedAt: string;
  fetchedAt: string;
  breed: string;
  sex: 'female' | 'castrated' | 'male' | 'mixed' | 'unknown';
  headCount: number | null;
  averagePriceYen: number | null;
  priceIncludesTax: boolean | null;
  sourceUrl: string;
  sourceRevision: string;
  status: 'preliminary' | 'final';
};
type ResultStore = { version: 1; results: MarketResult[]; notified: Record<string, string> };
const FILE = 'market-public-results-v1.json';
function validDate(value: unknown) {
  return typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
}
function validTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
export function normalizeMarketResults(sourceId: string, input: unknown, fetchedAt = new Date().toISOString()): MarketResult[] {
  if (!Array.isArray(input) || input.length > 2000 || sourceId.length < 1 || sourceId.length > 80)
    throw new Error('INVALID_MARKET_FEED');
  const output: MarketResult[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_MARKET_FEED');
    const v = raw as Record<string, unknown>;
    if (typeof v.prefecture !== 'string' || !v.prefecture ||
      typeof v.marketName !== 'string' || v.marketName.length < 1 || v.marketName.length > 80 ||
      !validDate(v.periodStart) || !validDate(v.periodEnd) ||
      String(v.periodStart) > String(v.periodEnd) || !validTimestamp(v.publishedAt) ||
      typeof v.sourceUrl !== 'string' || !/^https:\/\//.test(v.sourceUrl) ||
      typeof v.sourceRevision !== 'string' || !v.sourceRevision || v.sourceRevision.length > 128 ||
      typeof v.breed !== 'string' || !v.breed ||
      !['female','castrated','male','mixed','unknown'].includes(String(v.sex)) ||
      !['preliminary','final'].includes(String(v.status)) ||
      (v.headCount !== null && (!Number.isSafeInteger(v.headCount) || Number(v.headCount) < 0)) ||
      (v.averagePriceYen !== null && (!Number.isSafeInteger(v.averagePriceYen) || Number(v.averagePriceYen) < 0)) ||
      (v.priceIncludesTax !== null && typeof v.priceIncludesTax !== 'boolean'))
      throw new Error('INVALID_MARKET_FEED');
    const identity = [sourceId,v.prefecture,v.marketName,v.periodStart,v.periodEnd,v.breed,v.sex,v.sourceRevision].join('::');
    if (seen.has(identity)) throw new Error('DUPLICATE_MARKET_RESULT');
    seen.add(identity);
    const id = Buffer.from(identity).toString('base64url');
    output.push({ id, sourceId, prefecture:String(v.prefecture),marketName:String(v.marketName),
      periodStart:String(v.periodStart),periodEnd:String(v.periodEnd),publishedAt:String(v.publishedAt),
      fetchedAt,breed:String(v.breed),sex:v.sex as MarketResult['sex'],
      headCount:v.headCount as number|null,averagePriceYen:v.averagePriceYen as number|null,
      priceIncludesTax:v.priceIncludesTax as boolean|null,sourceUrl:String(v.sourceUrl),
      sourceRevision:String(v.sourceRevision),status:v.status as MarketResult['status'] });
  }
  return output;
}
async function read(root: string): Promise<ResultStore> {
  const data = await strictRead(root, FILE, true);
  if (data === undefined) return {version:1,results:[],notified:{}};
  if (data?.version !== 1 || !Array.isArray(data.results) || !data.notified || typeof data.notified !== 'object')
    throw new Error('INVALID_MARKET_RESULT_STORE');
  return data as ResultStore;
}
export async function listMarketResults() {
  return (await read(runtimeRoot())).results;
}
export async function saveMarketResults(results: MarketResult[]) {
  return lifecycleLock(async root => {
    const store = await read(root);
    const existing = new Set(store.results.map(row => row.id));
    const added = results.filter(row => !existing.has(row.id));
    store.results = [...store.results, ...added].slice(-5000);
    await atomicWrite(root, FILE, store);
    return added;
  });
}
export async function claimResultNotification(eventKey: string) {
  if (!eventKey || eventKey.length > 700) throw new Error('INVALID_MARKET_EVENT');
  return lifecycleLock(async root => {
    const store = await read(root);
    if (store.notified[eventKey]) return false;
    store.notified[eventKey] = new Date().toISOString();
    await atomicWrite(root, FILE, store);
    return true;
  });
}
