import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { createPasswordHash, type FarmProUser } from './authStore';
import { getActiveSubscriptionSummary, stripeWebhookHandler } from './stripeWebhook';

// Only a disposable data root and loopback HTTP are used. A notice is a local
// fact received through the signed webhook, not a request to cancel on Stripe.
const SECRET = 'fixture-only-ordering-webhook-secret';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const SUB = 'sub_fixtureOrdering';
const envKeys = ['FARMPRO_DATA_DIR', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_TEST_SECRET', 'NODE_ENV'] as const;
const realFetch = globalThis.fetch;
let root: string;
let origin: string;
let server: Server;
let previous: Record<string, string | undefined>;
let users: FarmProUser[];

async function put(file: string, data: unknown) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), JSON.stringify(data));
}
async function raw(file: string) { return fs.readFile(path.join(root, file), 'utf-8'); }
async function rows(file: string) { return JSON.parse(await raw(file)); }
async function protectedFiles() {
  return Promise.all(['users.json', 'bank-transfer-applications.json', 'farms/farm-target/cattle.json', 'farms/farm-other/cattle.json'].map(raw));
}
function checkout(id = 'evt_fixtureCheckout', overrides: Record<string, unknown> = {}) {
  return { id, type: 'checkout.session.completed', data: { object: {
    id: 'cs_test_fixtureOrdering', mode: 'subscription', payment_status: 'paid', currency: 'jpy', amount_total: 2750,
    subscription: SUB, client_reference_id: USER_ID, customer_details: { email: 'target@example.invalid' }, ...overrides,
  } } };
}
function notice(id = 'evt_fixtureEnded', subscriptionId = SUB, status?: string) {
  return { id, type: status ? 'customer.subscription.updated' : 'customer.subscription.deleted',
    data: { object: { id: subscriptionId, ...(status ? { status } : {}) } } };
}
async function post(event: unknown, validSignature = true) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', validSignature ? SECRET : 'wrong-fixture-secret')
    .update(`${timestamp}.${body}`).digest('hex');
  return fetch(`${origin}/api/stripe/webhook`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${signature}` }, body });
}
function markerPath(subscriptionId = SUB) {
  return path.join(root, 'stripe-inactive-notices', `${crypto.createHash('sha256').update(subscriptionId).digest('hex')}.json`);
}

beforeEach(async () => {
  previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-ordering-fixture-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.NODE_ENV = 'test';
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  delete process.env.STRIPE_WEBHOOK_TEST_SECRET;
  const credentials = createPasswordHash('fixture-password');
  users = [USER_ID, OTHER_ID].map((id, index) => ({ id, farmId: index ? 'farm-other' : 'farm-target',
    farmName: 'Fixture Farm', name: 'Fixture Owner', email: index ? 'other@example.invalid' : 'target@example.invalid',
    role: 'owner', active: true, plan: 'free', ...credentials }));
  await put('users.json', users);
  await put('stripeSubscriptions.json', []);
  await put('stripeWebhookEvents.json', []);
  await put('bank-transfer-applications.json', []);
  await put('farms/farm-target/cattle.json', [{ id: 'fixture-target-cow' }]);
  await put('farms/farm-other/cattle.json', [{ id: 'fixture-other-cow' }]);
  const app = express();
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).origin, origin, 'External requests are forbidden in this fixture');
    return realFetch(input, init);
  };
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert(root.startsWith(path.join(os.tmpdir(), 'farmpro-ordering-fixture-')));
  await fs.rm(root, { recursive: true, force: true });
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});

test('a termination received before Checkout must not be forgotten or activate a Free account later', async () => {
  const before = await protectedFiles();
  assert.equal((await post(notice())).status, 200);
  assert.deepEqual(await protectedFiles(), before);
  assert.deepEqual(await rows('stripeSubscriptions.json'), [], 'Do not invent a user or plan for an unknown subscription');
  assert.equal((await post(checkout())).status, 500);
  assert.deepEqual(await protectedFiles(), before);
  assert.deepEqual(await rows('stripeSubscriptions.json'), []);
  assert(!(await rows('stripeWebhookEvents.json')).some((row: { id: string }) => row.id === 'evt_fixtureCheckout'));
});

test('canceled, incomplete_expired and unpaid observations block a late first association without claiming a refund', async () => {
  const before = await protectedFiles();
  for (const status of ['canceled', 'incomplete_expired', 'unpaid']) {
    const subscription = `${SUB}_${status}`;
    assert.equal((await post(notice(`evt_fixture_${status}`, subscription, status))).status, 200);
    assert.equal((await post(checkout(`evt_fixture_late_${status}`, { subscription }))).status, 500);
  }
  assert.deepEqual(await protectedFiles(), before);
  assert.deepEqual(await rows('stripeSubscriptions.json'), []);
});

test('period-end cancellation reservation is not a termination and preserves paid access', async () => {
  assert.equal((await post(checkout())).status, 200);
  const before = await protectedFiles();
  const event = notice('evt_fixtureReservation', SUB, 'active');
  Object.assign(event.data.object, { cancel_at_period_end: true });
  assert.equal((await post(event)).status, 200);
  assert.deepEqual(await protectedFiles(), before);
  assert.equal((await rows('stripeSubscriptions.json'))[0].status, 'active');
  await assert.rejects(fs.stat(markerPath()), { code: 'ENOENT' });
});

test('a notice for another subscription never blocks an unrelated new subscription', async () => {
  assert.equal((await post(notice('evt_fixtureOtherEnded', 'sub_fixtureOtherEnded'))).status, 200);
  assert.equal((await post(checkout())).status, 200);
  assert.equal((await rows('users.json')).find((row: FarmProUser) => row.id === USER_ID).plan, 'standard');
  assert.deepEqual((await rows('users.json')).find((row: FarmProUser) => row.id === OTHER_ID), users[1]);
});

test('inactive evidence survives the bounded processed-event history and a fresh module instance', async () => {
  assert.equal((await post(notice())).status, 200);
  // Simulate the existing 500-entry event history having rolled over.
  await put('stripeWebhookEvents.json', Array.from({ length: 500 }, (_, index) => ({
    id: `evt_fixtureOther${index}`, type: 'customer.created', processedAt: '2026-10-01T00:00:00.000Z',
  })));
  const before = await protectedFiles();
  const fresh = await import(`./stripeWebhook.ts?ordering=${crypto.randomUUID()}`);
  const body = Buffer.from(JSON.stringify(checkout()));
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body.toString()}`).digest('hex');
  let status = 200;
  const req = { body, header: () => `t=${timestamp},v1=${signature}` };
  const res = { status: (code: number) => { status = code; return res; }, json: () => res };
  await fresh.stripeWebhookHandler(req as never, res as never);
  assert.equal(status, 500);
  assert.deepEqual(await protectedFiles(), before);
});

test('duplicate end notices keep one durable fact without repeatedly changing unknown users', async () => {
  const before = await protectedFiles();
  assert.equal((await post(notice())).status, 200);
  const first = await fs.readFile(markerPath(), 'utf-8');
  assert.equal((await post(notice())).status, 200);
  assert.equal((await post(notice('evt_fixtureSecondDelivery'))).status, 200);
  assert.equal(await fs.readFile(markerPath(), 'utf-8'), first);
  assert.equal((await fs.readdir(path.dirname(markerPath()))).length, 1);
  assert.deepEqual(await protectedFiles(), before);
  assert(!first.includes(users[0].email));
  assert(!first.includes(users[0].passwordHash));
});

test('invalid signatures cannot poison the inactive evidence or prevent a legitimate checkout', async () => {
  assert.equal((await post(notice(), false)).status, 400);
  await assert.rejects(fs.stat(markerPath()), { code: 'ENOENT' });
  assert.equal((await post(checkout())).status, 200);
});

test('failure to persist a notice returns failure without acknowledging or changing a known contract', async () => {
  assert.equal((await post(checkout())).status, 200);
  await fs.writeFile(path.join(root, 'stripe-inactive-notices'), 'not-a-directory');
  const before = await protectedFiles();
  const subscriptions = await raw('stripeSubscriptions.json');
  assert.equal((await post(notice())).status, 500);
  assert.deepEqual(await protectedFiles(), before);
  assert.equal(await raw('stripeSubscriptions.json'), subscriptions);
  assert(!(await rows('stripeWebhookEvents.json')).some((row: { id: string }) => row.id === 'evt_fixtureEnded'));
});

test('corrupt evidence is not replaced or treated as absent by checkout or notice replay', async () => {
  assert.equal((await post(notice())).status, 200);
  await fs.writeFile(markerPath(), '{broken');
  const before = await protectedFiles();
  assert.equal((await post(checkout())).status, 500);
  assert.equal((await post(notice('evt_fixtureRetryEnd'))).status, 500);
  assert.equal(await fs.readFile(markerPath(), 'utf-8'), '{broken');
  assert.deepEqual(await protectedFiles(), before);
});

test('a known termination keeps a second active subscription and bank records unchanged', async () => {
  assert.equal((await post(checkout())).status, 200);
  assert.equal((await post(checkout('evt_fixtureNewPro', { subscription: 'sub_fixturePro', amount_total: 5500 }))).status, 200);
  const farms = await Promise.all(['farms/farm-target/cattle.json', 'farms/farm-other/cattle.json'].map(raw));
  assert.equal((await post(notice())).status, 200);
  assert.equal((await rows('stripeSubscriptions.json')).find((row: { subscriptionId: string }) => row.subscriptionId === SUB).status, 'inactive');
  assert.equal((await rows('users.json')).find((row: FarmProUser) => row.id === USER_ID).plan, 'pro');
  assert.deepEqual(await rows('bank-transfer-applications.json'), []);
  assert.deepEqual(await Promise.all(['farms/farm-target/cattle.json', 'farms/farm-other/cattle.json'].map(raw)), farms);
});

test('replaying an end event acknowledged by old code backfills evidence before duplicate detection', async () => {
  await put('stripeWebhookEvents.json', [{ id: 'evt_fixtureEnded', type: 'customer.subscription.deleted', processedAt: new Date().toISOString() }]);
  const before = await protectedFiles();
  const events = await raw('stripeWebhookEvents.json');
  assert.equal((await post(notice())).status, 200);
  assert.equal(await raw('stripeWebhookEvents.json'), events);
  assert.equal((await post(checkout())).status, 500);
  assert.deepEqual(await protectedFiles(), before);
});

test('an interrupted subscription-ledger update leaves durable evidence and succeeds on retry', async (t) => {
  assert.equal((await post(checkout())).status, 200);
  const rename = fs.rename;
  let fail = true;
  t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    if (String(args[1]) === path.join(root, 'stripeSubscriptions.json') && fail) {
      fail = false;
      throw new Error('fixture-ledger-publication-failed');
    }
    return rename(...args);
  });
  const before = await protectedFiles();
  assert.equal((await post(notice())).status, 500);
  assert.deepEqual(await protectedFiles(), before);
  assert.equal((await rows('stripeSubscriptions.json'))[0].status, 'active');
  assert.equal(await getActiveSubscriptionSummary(USER_ID), null, 'Recorded notice overrides a stale active row');
  assert.equal((await post(checkout('evt_fixtureLate'))).status, 500);
  assert.equal((await post(notice())).status, 200);
  assert.equal((await rows('stripeSubscriptions.json'))[0].status, 'inactive');
  assert.equal((await rows('users.json'))[0].plan, 'free');
});

test('a failed user-plan update is retried even when the subscription row already became inactive', async (t) => {
  assert.equal((await post(checkout())).status, 200);
  const rename = fs.rename;
  let fail = true;
  t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    if (String(args[1]) === path.join(root, 'users.json') && fail) {
      fail = false;
      throw new Error('fixture-plan-publication-failed');
    }
    return rename(...args);
  });
  assert.equal((await post(notice())).status, 500);
  assert.equal((await rows('stripeSubscriptions.json'))[0].status, 'inactive');
  assert.equal((await rows('users.json'))[0].plan, 'standard');
  assert.equal((await post(notice())).status, 200);
  assert.equal((await rows('users.json'))[0].plan, 'free');
  assert.deepEqual((await rows('users.json'))[1], users[1]);
});

test('event-history publication failure never discards the inactive fact or grants late access', async (t) => {
  const rename = fs.rename;
  let fail = true;
  t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    if (String(args[1]) === path.join(root, 'stripeWebhookEvents.json') && fail) {
      fail = false;
      throw new Error('fixture-acknowledgement-failed');
    }
    return rename(...args);
  });
  const before = await protectedFiles();
  assert.equal((await post(notice())).status, 500);
  const marker = await fs.readFile(markerPath(), 'utf-8');
  assert.equal((await post(checkout())).status, 500);
  assert.equal((await post(notice())).status, 200);
  assert.equal(await fs.readFile(markerPath(), 'utf-8'), marker);
  assert.deepEqual(await protectedFiles(), before);
});

test('an ended Stripe contract leaves the current paid bank period and farm records intact', async () => {
  assert.equal((await post(checkout())).status, 200);
  await put('bank-transfer-applications.json', [{ id: 'fixture-bank', userId: USER_ID, farmId: 'farm-target',
    plan: 'pro', billing: 'yearly', status: 'active', createdAt: new Date().toISOString(),
    contractEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() }]);
  const bank = await raw('bank-transfer-applications.json');
  const farms = await Promise.all(['farms/farm-target/cattle.json', 'farms/farm-other/cattle.json'].map(raw));
  assert.equal((await post(notice())).status, 200);
  assert.equal((await rows('users.json'))[0].plan, 'pro');
  assert.equal(await raw('bank-transfer-applications.json'), bank);
  assert.deepEqual(await Promise.all(['farms/farm-target/cattle.json', 'farms/farm-other/cattle.json'].map(raw)), farms);
});

test('mismatched oversized or linked notice files are never treated as missing', async () => {
  assert.equal((await post(notice())).status, 200);
  const value = JSON.parse(await fs.readFile(markerPath(), 'utf-8'));
  const before = await protectedFiles();
  for (const bad of [{ ...value, subscriptionId: 'sub_other' }, { ...value, version: 2 },
    { ...value, reason: 'active' }, { ...value, recordedAt: 'not-a-date' }, { ...value, padding: 'x'.repeat(5000) }]) {
    await fs.writeFile(markerPath(), JSON.stringify(bad));
    assert.equal((await post(checkout())).status, 500);
    assert.equal(await fs.readFile(markerPath(), 'utf-8'), JSON.stringify(bad));
  }
  const shared = path.join(root, 'fixture-shared-notice.json');
  await fs.writeFile(shared, JSON.stringify(value));
  await fs.unlink(markerPath());
  await fs.symlink(shared, markerPath());
  assert.equal((await post(checkout())).status, 500);
  assert.equal((await post(notice('evt_fixtureLinked'))).status, 500);
  assert.equal(await fs.readFile(shared, 'utf-8'), JSON.stringify(value));
  assert.deepEqual(await protectedFiles(), before);
});

test('a linked notice directory cannot redirect reads or writes to a different fixture area', async () => {
  const elsewhere = path.join(root, 'fixture-elsewhere');
  await fs.mkdir(elsewhere);
  await fs.symlink(elsewhere, path.join(root, 'stripe-inactive-notices'), 'dir');
  const before = await protectedFiles();
  assert.equal((await post(notice())).status, 500);
  assert.equal((await post(checkout())).status, 500);
  assert.deepEqual(await fs.readdir(elsewhere), []);
  assert.deepEqual(await protectedFiles(), before);
});

test('concurrent end and checkout deliveries finish without an active ended subscription', async () => {
  const before = await protectedFiles();
  const [end, paid] = await Promise.all([post(notice()), post(checkout())]);
  assert.equal(end.status, 200);
  assert([200, 500].includes(paid.status));
  assert.equal(await getActiveSubscriptionSummary(USER_ID), null);
  assert.equal((await rows('users.json'))[0].plan, 'free');
  assert.deepEqual(await protectedFiles(), before);
  assert.equal((await post(checkout('evt_fixtureReplay'))).status, 500);
});

test('an inactive subscription cannot use legacy email fallback or another user reference', async () => {
  assert.equal((await post(notice())).status, 200);
  const before = await protectedFiles();
  for (const reference of [null, OTHER_ID]) {
    assert.equal((await post(checkout('evt_fixtureAlternateReference', { client_reference_id: reference }))).status, 500);
  }
  assert.deepEqual(await protectedFiles(), before);
  assert.deepEqual(await rows('stripeSubscriptions.json'), []);
});
