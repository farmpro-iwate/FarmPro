import { listMarketNotificationPreferences, type MarketWatch } from './marketWatchlistStore';
import { normalizeMarketResults, saveMarketResults, claimResultNotification, isResultNotificationClaimed, listMarketResults, type MarketResult } from './marketResultsStore';
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
export function isApprovedMarketFeedConfigured() {
  try { return config() !== null; }
  catch { return false; }
}
function isRecent(date: string, now: number) {
  const delta = now - Date.parse(date);
  return Number.isFinite(delta) && delta >= 0 && delta <= 14 * 86400000;
}
type Recipient = { farmId: string; userId: string; markets: MarketWatch[] };
type DeliveryDependencies = {
  wasSent: (key: string) => Promise<boolean>;
  markSent: (key: string) => Promise<boolean>;
  send: typeof sendPushToUser;
};

/** A failed recipient must not block other recipients or erase the pending result. */
export async function deliverMarketResultNotifications(
  results: readonly MarketResult[],
  recipients: readonly Recipient[],
  deps: DeliveryDependencies = {
    wasSent: isResultNotificationClaimed,
    markSent: claimResultNotification,
    send: sendPushToUser,
  },
): Promise<{ delivered: number; failures: number }> {
  let delivered = 0;
  let failures = 0;
  for (const result of results) {
    if (!isRecent(result.publishedAt, Date.now())) continue;
    for (const recipient of recipients) {
      if (!recipient.markets.some(w => w.notify &&
        w.prefecture === result.prefecture && w.name === result.marketName)) continue;
      const key = recipient.farmId + ':' + recipient.userId + ':' + result.id;
      try {
        if (await deps.wasSent(key)) continue;
        const push = await deps.send(recipient.farmId, recipient.userId, {
          title: 'FarmPro 子牛市場結果',
          body: result.marketName + '（' + result.periodStart + '〜' + result.periodEnd + '）の公表結果が更新されました',
          url: '/market-results',
          tag: 'farmpro-market-result-' + result.id.slice(-60),
        });
        if (!push.missing && push.sent > 0 && await deps.markSent(key)) delivered++;
      } catch (error) {
        failures++;
        console.error('FarmPro market notification delivery failed', {
          farmId: recipient.farmId, userId: recipient.userId, resultId: result.id, error,
        });
      }
    }
  }
  return { delivered, failures };
}

/** Retry notifications from already-stored results, even when the upstream feed is offline. */
export async function deliverPendingMarketResults(sourceId: string) {
  const recent = (await listMarketResults()).filter(row =>
    row.sourceId === sourceId && isRecent(row.publishedAt, Date.now()));
  const recipients = await listMarketNotificationPreferences();
  return deliverMarketResultNotifications(recent, recipients);
}

export async function pollApprovedMarketResults() {
  if (inFlight) return { enabled: true, added: 0, skipped: 'busy' };
  const feed = config();
  if (!feed) return { enabled: false, added: 0 };
  inFlight = true;
  try {
    let added = 0;
    let fetchFailed = false;
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
      added = (await saveMarketResults(normalized)).length;
    } catch (error) {
      fetchFailed = true;
      // Do not expose the configured URL/token in logs or abandon previously saved notices.
      console.error('FarmPro market feed: retrieval or validation failed', {
        code: error instanceof Error ? error.name : 'UNKNOWN',
      });
    }
    const notices = await deliverPendingMarketResults(feed.sourceId);
    return { enabled: true, added, fetchFailed, ...notices };
  } finally { inFlight = false; }
}
