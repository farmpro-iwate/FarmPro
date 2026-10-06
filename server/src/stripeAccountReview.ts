// Read-only evidence for account deletion review, NOT a deletion authorization.
// List APIs are deliberate: customer email filtering is case-sensitive and
// Stripe Search is eventually consistent. A completed scan is not an atomic
// snapshot and cannot stop someone opening a new Payment Link afterwards.
export type StripeReviewTarget = { id: string; farmId: string; email: string };
export type StripeAccountReview = {
  state: 'unavailable' | 'review_required' | 'no_match';
  code: string;
  message: string;
  checkedAt: string | null;
  mode: 'live' | 'test' | null;
  mayDelete: false;
  scanComplete: boolean;
  matches: { customers: number; subscriptions: number; checkoutSessions: number; openCheckoutSessions: number } | null;
};
type Config = { key: string; accountId: string; live: boolean };
type Row = Record<string, unknown>;
type Evidence = { id: string; customer: string | null; subscription: string | null; direct: boolean; status: string; anonymousOpen: boolean };
type Options = { fetcher?: typeof fetch; timeoutMs?: number; maxPages?: number };

const MESSAGES: Record<string, string> = {
  configuration: 'Stripe照合用の接続設定が未完了です。契約なしとは判断しません。',
  target: '対象の利用者情報を確認できません。',
  busy: '別のStripe照合を実行中です。時間をおいて再確認してください。',
  timeout: 'Stripeの照合が時間内に完了しませんでした。契約なしとは判断しません。',
  access: 'Stripe照合の認証・読取権限を確認してください。',
  rate_limit: 'Stripeの照合回数制限に達しました。時間をおいて再確認してください。',
  connection: 'Stripeの情報を取得できませんでした。契約なしとは判断しません。',
  response: 'Stripeの応答を確認できません。取得結果を削除の根拠にはしません。',
  account: '照合先のStripeアカウントが設定と一致しません。',
  mode: 'Stripeの本番・テスト環境が一致しません。',
  limit: 'Stripeの全ページを確認できませんでした。途中の結果で契約なしとは判断しません。',
  match: 'Stripeに対象と関連する顧客・契約・決済手続きの記録があります。削除前に確認が必要です。',
  anonymous: '利用者を特定できない未完了の決済手続きがあります。対象外とは断定しません。',
  no_match: '取得した範囲では一致する記録が見つかりませんでした。照合後の新規決済や別のメールでの契約まで否定する結果ではなく、削除許可ではありません。',
};
class ReviewFailure extends Error {}
function fail(code: string): never { throw new ReviewFailure(code); }
function record(value: unknown): value is Row { return !!value && typeof value === 'object' && !Array.isArray(value); }
function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return fail('response');
  return value;
}
function reference(value: unknown, prefix: string): string | null {
  if (value === null || value === undefined) return null;
  const id = typeof value === 'string' ? value : record(value) ? value.id : null;
  if (typeof id !== 'string' || !new RegExp(`^${prefix}_[a-zA-Z0-9]+$`).test(id)) return fail('response');
  return id;
}
function metadata(value: unknown): Row {
  if (value === null || value === undefined) return {};
  if (!record(value) || Object.values(value).some((item) => typeof item !== 'string')) return fail('response');
  return value;
}
function configuration(): Config {
  const key = process.env.FARMPRO_STRIPE_REVIEW_KEY?.trim() || '';
  const accountId = process.env.FARMPRO_STRIPE_REVIEW_ACCOUNT_ID?.trim() || '';
  const mode = /^rk_(live|test)_[a-zA-Z0-9]+$/.exec(key)?.[1];
  if (!mode || !/^acct_[a-zA-Z0-9]+$/.test(accountId) || (process.env.NODE_ENV === 'production' && mode !== 'live')) fail('configuration');
  // Use a separate restricted key with read permissions only. Never reuse the
  // webhook secret, accept keys from HTTP input or expose a key in a response.
  return { key, accountId, live: mode === 'live' };
}
function evidence(row: Row, kind: string, target: StripeReviewTarget, live: boolean): Evidence {
  if (row.object !== kind || row.livemode !== live) fail(row.livemode !== live ? 'mode' : 'response');
  const id = reference(row.id, kind === 'customer' ? 'cus' : kind === 'subscription' ? 'sub' : 'cs');
  if (!id) return fail('response');
  const meta = metadata(row.metadata);
  const emails = [nullableString(row.email), nullableString(row.customer_email)];
  if (row.customer_details !== null && row.customer_details !== undefined) {
    if (!record(row.customer_details)) return fail('response');
    emails.push(nullableString(row.customer_details.email));
  }
  const ref = nullableString(row.client_reference_id);
  const identityValues = [meta.farmpro_user_id, meta.userId, meta.user_id, meta.farmpro_farm_id, meta.farmId, meta.farm_id];
  const direct = ref === target.id || identityValues.includes(target.id) || identityValues.includes(target.farmId) ||
    emails.some((email) => email?.trim().toLowerCase() === target.email.trim().toLowerCase());
  const customer = kind === 'customer' ? id : reference(row.customer, 'cus');
  const subscription = kind === 'subscription' ? id : reference(row.subscription, 'sub');
  let status = '';
  if (kind === 'subscription') {
    const known = ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete', 'incomplete_expired', 'canceled'];
    if (!customer || typeof row.status !== 'string' || !known.includes(row.status)) return fail('response');
    status = row.status;
  } else if (kind === 'checkout.session') {
    if (!['open', 'complete', 'expired'].includes(String(row.status)) || !['payment', 'subscription', 'setup'].includes(String(row.mode))) return fail('response');
    status = String(row.status);
  }
  const anonymousOpen = kind === 'checkout.session' && status === 'open' && !customer && !ref &&
    !identityValues.some(Boolean) && !emails.some((email) => email?.trim());
  return { id, customer, subscription, direct, status, anonymousOpen };
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) return fail('response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); return fail('limit'); }
      chunks.push(part.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf-8')); }
    catch { return fail('response'); }
  } finally { reader.releaseLock(); }
}

// A factory permits isolated mocked tests. Production callers use the singleton
// below; neither transport nor timeout nor credentials come from a web request.
export function createStripeAccountReviewer(options: Options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxPages = options.maxPages ?? 10;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new Error('INVALID_REVIEW_LIMITS');
  let running = false;
  return async (target: StripeReviewTarget): Promise<StripeAccountReview> => {
    const unavailable = (code: string, mode: StripeAccountReview['mode'] = null): StripeAccountReview => ({
      state: 'unavailable', code, message: MESSAGES[code] || MESSAGES.connection,
      checkedAt: null, mode, mayDelete: false, scanComplete: false, matches: null,
    });
    if (running) return unavailable('busy');
    let config: Config;
    try {
      if (!target || typeof target.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(target.id) ||
          typeof target.farmId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(target.farmId) ||
          typeof target.email !== 'string' || !target.email.includes('@')) fail('target');
      config = configuration();
    } catch (error) { return unavailable(error instanceof ReviewFailure ? error.message : 'configuration'); }
    running = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mode = config.live ? 'live' : 'test';
    const get = async (url: URL) => {
      if (controller.signal.aborted) return fail('timeout');
      const response = await (options.fetcher || globalThis.fetch)(url, {
        method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: controller.signal,
        headers: { Authorization: `Bearer ${config.key}`, Accept: 'application/json' },
      });
      if (controller.signal.aborted) return fail('timeout');
      if (!response.ok) {
        await response.body?.cancel();
        return fail(response.status === 401 || response.status === 403 ? 'access' : response.status === 429 ? 'rate_limit' : 'connection');
      }
      return boundedJson(response);
    };
    const list = async (pathname: string, kind: string, extra: Record<string, string> = {}) => {
      const rows: Evidence[] = [];
      const seen = new Set<string>();
      let cursor = '';
      for (let page = 0; page < maxPages; page++) {
        const url = new URL(`https://api.stripe.com${pathname}`);
        url.search = new URLSearchParams({ limit: '100', ...extra, ...(cursor ? { starting_after: cursor } : {}) }).toString();
        const result = await get(url);
        if (!record(result) || result.object !== 'list' || !Array.isArray(result.data) ||
            typeof result.has_more !== 'boolean' || result.data.length > 100) return fail('response');
        for (const row of result.data) {
          if (!record(row)) return fail('response');
          const item = evidence(row, kind, target, config.live);
          if (seen.has(item.id)) return fail('response');
          seen.add(item.id);
          rows.push(item);
        }
        if (!result.has_more) return rows;
        if (!result.data.length) return fail('response');
        cursor = rows[rows.length - 1].id;
      }
      return fail('limit');
    };
    const scan = async (): Promise<StripeAccountReview> => {
      const account = await get(new URL('https://api.stripe.com/v1/account'));
      if (!record(account) || account.object !== 'account' || account.id !== config.accountId) return fail('account');
      const customers = await list('/v1/customers', 'customer');
      const sessions = await list('/v1/checkout/sessions', 'checkout.session');
      // Include ended/incomplete contracts. A Free-only purge is not the right
      // workflow for an account with payment history, even after cancellation.
      const subscriptions = await list('/v1/subscriptions', 'subscription', { status: 'all' });
      const customerIds = new Set(customers.filter((row) => row.direct).map((row) => row.id));
      const subscriptionIds = new Set(subscriptions.filter((row) => row.direct).map((row) => row.id));
      for (const row of [...sessions, ...subscriptions]) {
        if (row.direct && row.customer) customerIds.add(row.customer);
        if (row.direct && row.subscription) subscriptionIds.add(row.subscription);
      }
      const matchedSubscriptions = subscriptions.filter((row) => row.direct || customerIds.has(row.customer || '') || subscriptionIds.has(row.id));
      for (const row of matchedSubscriptions) subscriptionIds.add(row.id);
      const matchedSessions = sessions.filter((row) => row.direct || customerIds.has(row.customer || '') || subscriptionIds.has(row.subscription || ''));
      const matches = { customers: customers.filter((row) => customerIds.has(row.id)).length,
        subscriptions: matchedSubscriptions.length, checkoutSessions: matchedSessions.length,
        openCheckoutSessions: matchedSessions.filter((row) => row.status === 'open').length };
      const found = matches.customers + matches.subscriptions + matches.checkoutSessions > 0;
      const anonymous = sessions.some((row) => row.anonymousOpen);
      const code = found ? 'match' : anonymous ? 'anonymous' : 'no_match';
      if (controller.signal.aborted) return fail('timeout');
      return { state: found || anonymous ? 'review_required' : 'no_match', code, message: MESSAGES[code],
        checkedAt: new Date().toISOString(), mode, mayDelete: false, scanComplete: true, matches };
    };
    try {
      return await Promise.race([scan(), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new ReviewFailure('timeout')); }, timeoutMs);
      })]);
    } catch (error) {
      // Never return raw Stripe errors, response bodies, customer data or keys.
      return unavailable(error instanceof ReviewFailure ? error.message : 'connection', mode);
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      running = false;
    }
  };
}

export const reviewStripeAccount = createStripeAccountReviewer();
