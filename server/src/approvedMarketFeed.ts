import { listMarketNotificationPreferences } from './marketWatchlistStore';
import { normalizeMarketResults, saveMarketResults, claimResultNotification, isResultNotificationClaimed, listMarketResults } from './marketResultsStore';
import { sendPushToUser } from './routes/pushNotifications';

const CHECK_LIMIT_MS = 15_000;
let inFlight = false;
function config() {
  // A market data provider must explicitly approve automated machine retrieval,
  // and operations must configure a pinned HTTPS feed. No scraping by default.
  if (process.env.FARMPRO_MARKET_FEED_APPROVED !== '1') return null;
  const raw = process.env.FARMPRO_MARKET_FEED_URL?.trim();
  const host = process.env.FARMPRO_MARKET_FEED_HOST?.trim();
  const token = process.env.FARMPRO_MARKET_FEED_TOKEN?.trim();
  const sourceId = process.env.FARMPRO_MARKET_FEED_SOURCE_ID?.trim();
  if (!raw || !host || !token || !sourceId) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port)
    throw new Error('MARKET_FEED_CONFIG_UNSAFE');
  return { url: url.toString(), token, sourceId };
}
function isRecent(date: string, now: number) {
  const delta = now - Date.parse(date);
  return Number.isFinite(delta) && delta >= 0 && delta <= 14 * 86400000;
}
export async function pollApprovedMarketResults() {
  if (inFlight) return { enabled: true, added: 0, skipped: 'busy' };
  const feed = config();
  if (!feed) return { enabled: false, added: 0 };
  inFlight = true;
  try {
    const response = await fetch(feed.url, {
      method:'GET',
      headers: { Accept:'application/json', Authorization:'Bearer ' + feed.token },
      signal:AbortSignal.timeout(CHECK_LIMIT_MS),
      redirect:'error',
    });
    if (!response.ok) throw new Error('MARKET_FEED_HTTP_' + response.status);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('MARKET_FEED_BAD_CONTENT_TYPE');
    const body = await response.json() as { results?: unknown };
    const normalized = normalizeMarketResults(feed.sourceId,body.results);
    const added = await saveMarketResults(normalized);
    // Scan persisted, recent results on every poll. A failed push must not be
    // lost merely because its result was successfully saved on the first poll.
    const pendingResults = (await listMarketResults()).filter(row =>
      row.sourceId === feed.sourceId && isRecent(row.publishedAt, Date.now()));
    const preferences = await listMarketNotificationPreferences();
    let delivered = 0;
    for (const result of pendingResults) {
      for (const pref of preferences) {
        if (!pref.markets.some(w => w.prefecture === result.prefecture && w.name === result.marketName)) continue;
        const eventKey = pref.farmId + ':' + pref.userId + ':' + result.id;
        // Do not notify if this result was already announced on an earlier poll.
        if (await isResultNotificationClaimed(eventKey)) continue;
        const send = await sendPushToUser(pref.farmId,pref.userId,{
          title:'FarmPro 子牛市場結果',
          body:result.marketName + '（' + result.periodStart + '〜' + result.periodEnd + '）の公表結果が更新されました',
          url:'/market-results',
          tag:'farmpro-market-result-' + result.id.slice(-60),
        });
        if (!send.missing && send.sent > 0 && await claimResultNotification(eventKey)) delivered++;
      }
    }
    return { enabled: true, added: added.length, delivered };
  } finally { inFlight = false; }
}
