import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createStripeAccountReviewer, type StripeAccountReview, type StripeReviewTarget } from './stripeAccountReview';

// All transports in this file are mocks. No Stripe account, real key, network
// connection, payment or account deletion is used by these tests.
const target = { id: 'target', farmId: 'farm-target', email: 'target@example.invalid' };
const fixtureKey = 'rk_test_FixtureReadOnlyKey';
const env = ['FARMPRO_STRIPE_REVIEW_KEY', 'FARMPRO_STRIPE_REVIEW_ACCOUNT_ID', 'NODE_ENV'] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(env.map((key) => [key, process.env[key]]));
  process.env.FARMPRO_STRIPE_REVIEW_KEY = fixtureKey;
  process.env.FARMPRO_STRIPE_REVIEW_ACCOUNT_ID = 'acct_Fixture';
  process.env.NODE_ENV = 'test';
});
afterEach(() => {
  for (const key of env) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const page = (data: unknown[] = [], has_more = false) => ({ object: 'list', data, has_more });
const customer = (extra: Record<string, unknown> = {}) => ({ object: 'customer', id: 'cus_Fixture', livemode: false, email: null, metadata: {}, ...extra });
const session = (extra: Record<string, unknown> = {}) => ({ object: 'checkout.session', id: 'cs_test_Fixture', livemode: false,
  mode: 'subscription', status: 'open', customer: null, subscription: null, customer_email: null, customer_details: null,
  client_reference_id: 'another-user', metadata: {}, ...extra });
const subscription = (extra: Record<string, unknown> = {}) => ({ object: 'subscription', id: 'sub_Fixture', livemode: false,
  customer: 'cus_Fixture', status: 'active', metadata: {}, ...extra });
type Override = (url: URL, index: number) => unknown | Promise<unknown>;
function transport(override: Override = () => undefined) {
  const calls: { url: URL; options: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (input, options) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    const result = await override(url, calls.length);
    if (result !== undefined) return result instanceof Response ? result : json(result);
    return json(url.pathname === '/v1/account' ? { object: 'account', id: 'acct_Fixture' } : page());
  };
  return { fetcher, calls };
}
function denied(result: StripeAccountReview, code: string) {
  assert.equal(result.state, 'unavailable');
  assert.equal(result.code, code);
  assert.equal(result.mayDelete, false);
  assert.equal(result.scanComplete, false);
  assert.equal(result.checkedAt, null);
  assert.equal(result.matches, null);
  assert(!JSON.stringify(result).includes(fixtureKey));
}
function matched(result: StripeAccountReview) {
  assert.equal(result.state, 'review_required');
  assert.equal(result.code, 'match');
  assert.equal(result.scanComplete, true);
  assert.equal(result.mayDelete, false);
  assert(result.checkedAt && Number.isFinite(Date.parse(result.checkedAt)));
}

test('missing settings and wrong key kinds stop before any network request', async () => {
  const mock = transport();
  const review = createStripeAccountReviewer(mock);
  for (const key of ['', 'sk_live_Fixture', 'pk_test_Fixture', 'whsec_Fixture', 'rk_test_bad\nheader']) {
    process.env.FARMPRO_STRIPE_REVIEW_KEY = key;
    denied(await review(target), 'configuration');
  }
  process.env.FARMPRO_STRIPE_REVIEW_KEY = fixtureKey;
  for (const id of ['', 'other-account', 'https://example.invalid/']) {
    process.env.FARMPRO_STRIPE_REVIEW_ACCOUNT_ID = id;
    denied(await review(target), 'configuration');
  }
  assert.equal(mock.calls.length, 0);
});

test('test keys are rejected in production, even when all remote lists would be empty', async () => {
  process.env.NODE_ENV = 'production';
  const mock = transport();
  denied(await createStripeAccountReviewer(mock)(target), 'configuration');
  assert.equal(mock.calls.length, 0);
});

test('invalid target IDs and email addresses never reach Stripe', async () => {
  const mock = transport();
  for (const input of [null, { ...target, id: '../other' }, { ...target, farmId: '' }, { ...target, email: 'not-an-email' },
    { ...target, email: 'target@example.invalid\n' }, { ...target, email: `${'a'.repeat(513)}@example.invalid` }]) {
    denied(await createStripeAccountReviewer(mock)(input as StripeReviewTarget), 'target');
  }
  assert.equal(mock.calls.length, 0);
});

test('empty completed lists return only no-match evidence and never deletion authorization', async () => {
  const mock = transport();
  const result = await createStripeAccountReviewer(mock)(target);
  assert.equal(result.state, 'no_match');
  assert.equal(result.scanComplete, true);
  assert.equal(result.mode, 'test');
  assert.equal(result.mayDelete, false);
  assert.deepEqual(result.matches, { customers: 0, subscriptions: 0, checkoutSessions: 0, openCheckoutSessions: 0 });
  assert(result.checkedAt && Number.isFinite(Date.parse(result.checkedAt)));
  assert.deepEqual(mock.calls.map(({ url }) => url.pathname), ['/v1/account', '/v1/customers', '/v1/checkout/sessions', '/v1/subscriptions']);
  for (const { url, options } of mock.calls) {
    assert.equal(url.origin, 'https://api.stripe.com');
    assert.equal(options?.method, 'GET');
    assert.equal(options?.body, undefined);
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.cache, 'no-store');
    assert(options?.signal instanceof AbortSignal);
    assert.equal(new Headers(options?.headers).get('Authorization'), `Bearer ${fixtureKey}`);
    assert.equal(url.searchParams.has('email'), false);
    assert.equal(url.searchParams.has('created'), false);
  }
  assert.equal(mock.calls.at(-1)?.url.searchParams.get('status'), 'all');
  assert(!JSON.stringify(result).includes(target.email));
});

test('customer email matching ignores case without the case-sensitive API email filter', async () => {
  const mock = transport((url) => url.pathname === '/v1/customers' ? page([customer({ email: 'TARGET@EXAMPLE.INVALID' })]) : undefined);
  const result = await createStripeAccountReviewer(mock)(target);
  matched(result);
  assert.equal(result.matches?.customers, 1);
});

test('a real-shaped open Checkout ID and client reference identify a pending payment without a customer', async () => {
  const mock = transport((url) => url.pathname === '/v1/checkout/sessions' ? page([session({
    id: 'cs_test_a11YYufWQzNY63zpQ6QSNRQhkUpVph4WRmzW0zWJO2znZKdVujZ0N0S22u', client_reference_id: target.id,
  })]) : undefined);
  const result = await createStripeAccountReviewer(mock)(target);
  matched(result);
  assert.equal(result.matches?.openCheckoutSessions, 1);
});

test('both Checkout email fields are checked, including a session with no customer ID', async () => {
  for (const extra of [{ customer_email: target.email }, { customer_details: { email: target.email.toUpperCase() } }]) {
    const mock = transport((url) => url.pathname === '/v1/checkout/sessions' ? page([session(extra)]) : undefined);
    matched(await createStripeAccountReviewer(mock)(target));
  }
});

test('all supported user and farm metadata spellings trigger review', async () => {
  for (const [key, value] of [['farmpro_user_id', target.id], ['userId', target.id], ['user_id', target.id],
    ['farmpro_farm_id', target.farmId], ['farmId', target.farmId], ['farm_id', target.farmId]]) {
    const mock = transport((url) => url.pathname === '/v1/subscriptions' ? page([subscription({ metadata: { [key]: value } })]) : undefined);
    matched(await createStripeAccountReviewer(mock)(target));
  }
});

test('an old Checkout reference connects a changed customer email to subscription history', async () => {
  const mock = transport((url) => {
    if (url.pathname === '/v1/customers') return page([customer({ email: 'changed@example.invalid' })]);
    if (url.pathname === '/v1/checkout/sessions') return page([session({ status: 'complete', client_reference_id: target.id, customer: { id: 'cus_Fixture' }, subscription: { id: 'sub_Fixture' } })]);
    if (url.pathname === '/v1/subscriptions') return page([subscription()]);
  });
  const result = await createStripeAccountReviewer(mock)(target);
  matched(result);
  assert.deepEqual(result.matches, { customers: 1, subscriptions: 1, checkoutSessions: 1, openCheckoutSessions: 0 });
});

test('a matching customer links contracts and open Checkout sessions without matching session email', async () => {
  const mock = transport((url) => {
    if (url.pathname === '/v1/customers') return page([customer({ email: target.email })]);
    if (url.pathname === '/v1/checkout/sessions') return page([session({ customer: 'cus_Fixture' })]);
    if (url.pathname === '/v1/subscriptions') return page([subscription()]);
  });
  const result = await createStripeAccountReviewer(mock)(target);
  matched(result);
  assert.equal(result.matches?.openCheckoutSessions, 1);
  assert.equal(result.matches?.subscriptions, 1);
});

test('every known subscription state requires review, including ended and incomplete records', async () => {
  for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete', 'incomplete_expired', 'canceled']) {
    const mock = transport((url) => url.pathname === '/v1/subscriptions' ? page([subscription({ status, metadata: { userId: target.id } })]) : undefined);
    matched(await createStripeAccountReviewer(mock)(target));
  }
});

test('expired and complete matched sessions remain payment-history evidence', async () => {
  for (const status of ['expired', 'complete']) {
    const mock = transport((url) => url.pathname === '/v1/checkout/sessions' ? page([session({ status, client_reference_id: target.id })]) : undefined);
    const result = await createStripeAccountReviewer(mock)(target);
    matched(result);
    assert.equal(result.matches?.openCheckoutSessions, 0);
  }
});

test('an anonymous open session cannot be dismissed as belonging to someone else', async () => {
  const mock = transport((url) => url.pathname === '/v1/checkout/sessions' ? page([session({ client_reference_id: null })]) : undefined);
  const result = await createStripeAccountReviewer(mock)(target);
  assert.equal(result.state, 'review_required');
  assert.equal(result.code, 'anonymous');
  assert.equal(result.mayDelete, false);
});

test('unrelated valid records do not become matches, but still do not authorize deletion', async () => {
  const mock = transport((url) => {
    if (url.pathname === '/v1/customers') return page([customer({ email: 'other@example.invalid' })]);
    if (url.pathname === '/v1/checkout/sessions') return page([session()]);
    if (url.pathname === '/v1/subscriptions') return page([subscription()]);
  });
  const result = await createStripeAccountReviewer(mock)(target);
  assert.equal(result.state, 'no_match');
  assert.equal(result.mayDelete, false);
});

test('customer pagination follows the exact last ID and includes later matches', async () => {
  const mock = transport((url) => {
    if (url.pathname !== '/v1/customers') return;
    return url.searchParams.get('starting_after') === 'cus_First'
      ? page([customer({ email: target.email })])
      : page([customer({ id: 'cus_First' })], true);
  });
  matched(await createStripeAccountReviewer(mock)(target));
  assert.equal(mock.calls.filter(({ url }) => url.pathname === '/v1/customers').length, 2);
});

test('Checkout pagination accepts cs_test and includes a match on the second page', async () => {
  const mock = transport((url) => {
    if (url.pathname !== '/v1/checkout/sessions') return;
    return url.searchParams.get('starting_after') === 'cs_test_First'
      ? page([session({ client_reference_id: target.id })]) : page([session({ id: 'cs_test_First' })], true);
  });
  matched(await createStripeAccountReviewer(mock)(target));
});

test('repeated page IDs, impossible empty continuation and page-size violations fail closed', async () => {
  for (const body of [page([customer()], true), page([], true), page(Array.from({ length: 101 }, (_, i) => customer({ id: `cus_${i}` })))]) {
    const mock = transport((url) => url.pathname === '/v1/customers' ? body : undefined);
    denied(await createStripeAccountReviewer(mock)(target), 'response');
  }
});

test('reaching the page budget discards incomplete evidence even after finding a match', async () => {
  const mock = transport((url, i) => url.pathname === '/v1/customers' ? page([customer({ id: `cus_${i}`, email: target.email })], true) : undefined);
  denied(await createStripeAccountReviewer({ ...mock, maxPages: 1 })(target), 'limit');
});

test('wrong Stripe account fails before any customer data is requested', async () => {
  const mock = transport((url) => url.pathname === '/v1/account' ? { object: 'account', id: 'acct_Other' } : undefined);
  denied(await createStripeAccountReviewer(mock)(target), 'account');
  assert.equal(mock.calls.length, 1);
});

test('response mode must agree with the configured live or test key', async () => {
  const mock = transport((url) => url.pathname === '/v1/customers' ? page([customer({ livemode: true })]) : undefined);
  denied(await createStripeAccountReviewer(mock)(target), 'mode');
});

test('live mode accepts cs_live identifiers with a dedicated live fixture key', async () => {
  process.env.NODE_ENV = 'production';
  process.env.FARMPRO_STRIPE_REVIEW_KEY = 'rk_live_FixtureOnlyNotARealKey';
  const mock = transport((url) => url.pathname === '/v1/checkout/sessions' ? page([session({ livemode: true, id: 'cs_live_Fixture', client_reference_id: target.id })]) : undefined);
  const result = await createStripeAccountReviewer(mock)(target);
  matched(result);
  assert.equal(result.mode, 'live');
});

test('malformed IDs, object shapes and unknown subscription states are never no-match evidence', async () => {
  for (const row of [subscription({ id: 'wrong' }), subscription({ customer: null }), subscription({ status: 'future_unknown' }),
    subscription({ metadata: [] }), subscription({ metadata: { userId: 123 } }), subscription({ object: 'wrong' }), subscription({ customer_email: 1 })]) {
    const mock = transport((url) => url.pathname === '/v1/subscriptions' ? page([row]) : undefined);
    denied(await createStripeAccountReviewer(mock)(target), 'response');
  }
});

test('a Checkout ID from the wrong environment and malformed Checkout details fail closed', async () => {
  for (const row of [session({ id: 'cs_live_Fixture' }), session({ id: 'cs_Fixture' }), session({ status: 'new_status' }),
    session({ mode: 'unknown' }), session({ customer_details: [] }), session({ client_reference_id: 1 })]) {
    const mock = transport((url) => url.pathname === '/v1/checkout/sessions' ? page([row]) : undefined);
    denied(await createStripeAccountReviewer(mock)(target), 'response');
  }
});

test('malformed list envelopes never count as empty successful lists', async () => {
  for (const body of [{}, [], null, { object: 'list', data: [], has_more: 'false' }, page([null])]) {
    const mock = transport((url) => url.pathname === '/v1/customers' ? body : undefined);
    denied(await createStripeAccountReviewer(mock)(target), 'response');
  }
});

test('authentication errors, rate limits and server failures disclose no raw Stripe response', async () => {
  for (const [status, code] of [[401, 'access'], [403, 'access'], [429, 'rate_limit'], [500, 'connection']] as const) {
    const mock = transport(() => json({ error: { message: `${fixtureKey} private-customer-data` } }, status));
    const result = await createStripeAccountReviewer(mock)(target);
    denied(result, code);
    assert(!JSON.stringify(result).includes('private-customer-data'));
  }
});

test('transport failures are sanitized rather than returned to the operator', async () => {
  const mock = transport(() => { throw new Error(`${fixtureKey} transport details`); });
  const result = await createStripeAccountReviewer(mock)(target);
  denied(result, 'connection');
  assert(!JSON.stringify(result).includes('transport details'));
});

test('HTML, invalid JSON, absent bodies and oversized bodies fail closed', async () => {
  for (const [make, code] of [
    [() => new Response('<html>blocked</html>', { headers: { 'Content-Type': 'text/html' } }), 'response'],
    [() => new Response('{', { headers: { 'Content-Type': 'application/json' } }), 'response'],
    [() => new Response(null, { headers: { 'Content-Type': 'application/json' } }), 'response'],
    [() => json({ content: 'x'.repeat(2 * 1024 * 1024) }), 'limit'],
  ] as const) {
    const mock = transport(() => make());
    denied(await createStripeAccountReviewer(mock)(target), code);
  }
});

test('a partial scan loses its matches when the remaining source cannot be read', async () => {
  const mock = transport((url) => {
    if (url.pathname === '/v1/customers') return page([customer({ email: target.email })]);
    if (url.pathname === '/v1/subscriptions') return json({ error: 'unavailable' }, 503);
  });
  denied(await createStripeAccountReviewer(mock)(target), 'connection');
});

test('one scan at a time and timeout do not leave a permanent busy state', async () => {
  let complete!: (value: unknown) => void;
  const mock = transport((_url, i) => i === 1 ? new Promise((resolve) => { complete = resolve; }) : undefined);
  const review = createStripeAccountReviewer({ ...mock, timeoutMs: 20 });
  const first = review(target);
  denied(await review(target), 'busy');
  const timedOut = await first;
  denied(timedOut, 'timeout');
  assert.equal(mock.calls[0].options?.signal?.aborted, true);
  const count = mock.calls.length;
  complete({ object: 'account', id: 'acct_Fixture' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(mock.calls.length, count);
  assert.equal((await review(target)).state, 'no_match');
});

test('invalid resource limits cannot silently disable review bounds', () => {
  for (const limits of [{ maxPages: 0 }, { maxPages: 21 }, { maxPages: 1.5 }, { timeoutMs: 0 }, { timeoutMs: 30001 }]) {
    assert.throws(() => createStripeAccountReviewer(limits), /INVALID_REVIEW_LIMITS/);
  }
});
