import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { createPasswordHash, createToken, updateUserActiveById, updateUserProfileById, verifyToken, type AuthUser, type FarmProUser } from '../authStore';
import { requireAuth } from '../authMiddleware';
import { operatorUsersRouter } from './operatorUsers';
import { accountEmailDigest, markAccountRetired, readAccountRetirements } from '../accountDeletionGuard';
import { beginAccountRequest } from '../accountRequestLease';
import { deleteOperatorFreeAccount, getOperatorDeletionPreview } from '../operatorAccountDeletionStore';
import { assessOperatorDeletionRequest } from '../operatorAccountDeletionGate';

// Only loopback HTTP and mkdtemp files are real. No request can reach Stripe:
// the transport below rejects every non-Stripe URL and mocks all Stripe URLs.
const realFetch = globalThis.fetch;
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'FARMPRO_OPERATOR_EMAILS',
  'FARMPRO_STRIPE_REVIEW_KEY', 'FARMPRO_STRIPE_REVIEW_ACCOUNT_ID', 'NODE_ENV'] as const;
let previous: Record<string, string | undefined>;
let root: string;
let origin: string;
let server: Server;
let users: FarmProUser[];
let calls: URL[];
let override: (url: URL) => unknown | Promise<unknown>;
const list = (data: unknown[] = []) => ({ object: 'list', has_more: false, data });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function safe(user: FarmProUser): AuthUser {
  const { passwordSalt, passwordHash, ...value } = user;
  return { ...value, plan: value.plan || 'free' };
}
async function put(file: string, value: unknown) {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value));
}
async function snapshot(): Promise<[string, string][]> {
  const visit = async (directory: string): Promise<string[]> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory()
      ? visit(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
  };
  return Promise.all((await visit(root)).sort().map(async (file) => [path.relative(root, file), await fs.readFile(file, 'utf-8')]));
}
async function confirm(id = 'target') {
  const preview = await getOperatorDeletionPreview(id, 'operator');
  return { farmId: preview.user.farmId, email: preview.user.email, revision: preview.revision, confirmed: true };
}
async function request(suffix: string, body?: unknown, actor: FarmProUser | null = users[0], method?: string) {
  return realFetch(`${origin}/api/operator/users/${suffix}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${createToken(safe(actor))}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('fixture synchronization timed out')), 3000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
async function assertBlocked(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.deleted, false);
  assert.equal(body.canDelete, false);
  assert.equal(body.code, code);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  return body;
}

beforeEach(async () => {
  previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-deletion-gate-fixture-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'fixture-only-auth-secret';
  process.env.FARMPRO_OPERATOR_EMAILS = 'operator@example.invalid';
  process.env.FARMPRO_STRIPE_REVIEW_KEY = 'rk_test_FixtureReadOnlyKey';
  process.env.FARMPRO_STRIPE_REVIEW_ACCOUNT_ID = 'acct_Fixture';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('fixture-password');
  users = ['operator', 'target', 'other'].map((id) => ({ id, farmId: `farm-${id}`, email: `${id}@example.invalid`,
    farmName: `${id} Fixture Farm`, name: 'Fixture Owner', role: 'owner', active: true, plan: 'free', ...credentials }));
  await put('users.json', users);
  await put('bank-transfer-applications.json', []);
  await put('stripeSubscriptions.json', []);
  await put('stripeWebhookEvents.json', []);
  await put('farms/farm-target/cattle.json', [{ id: 'target-cow' }]);
  await put('farms/farm-other/cattle.json', [{ id: 'other-cow' }]);
  calls = [];
  override = () => undefined;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.stripe.com');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.body, undefined);
    calls.push(url);
    const result = await override(url);
    if (result instanceof Response) return result;
    return json(result !== undefined ? result : url.pathname === '/v1/account' ? { object: 'account', id: 'acct_Fixture' } : list());
  };
  const app = express();
  app.use(express.json());
  app.use('/api/operator/users', requireAuth, operatorUsersRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (root) await fs.rm(root, { recursive: true, force: true });
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});

test('public preview cannot authorize erasure even when the local account is eligible', async () => {
  const before = await snapshot();
  const response = await request('target/deletion-preview');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.locallyEligible, true);
  assert.equal(body.canDelete, false);
  assert.match(body.reason, /最終確認/);
  assert.equal(body.user.passwordHash, undefined);
  assert.equal(body.user.passwordSalt, undefined);
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('confirmed HTTP delete with a completed no-match scan still cannot erase or disable the account', async () => {
  const expected = await confirm();
  const token = createToken(safe(users[1]));
  const before = await snapshot();
  const body = await assertBlocked(await request('target/delete', expected), 409, 'ACCOUNT_DELETION_RELEASE_PENDING');
  assert.equal(body.stripeReview.state, 'no_match');
  assert.equal(body.stripeReview.mayDelete, false);
  assert.equal(calls.length, 4);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await readAccountRetirements(), []);
  assert(await verifyToken(token));
});

test('missing configuration blocks a direct delete request without any network or file mutation', async () => {
  delete process.env.FARMPRO_STRIPE_REVIEW_KEY;
  const before = await snapshot();
  const body = await assertBlocked(await request('target/delete', await confirm()), 503, 'STRIPE_REVIEW_UNAVAILABLE');
  assert.equal(body.stripeReview.code, 'configuration');
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('matching customer, subscription and open Checkout independently prevent erasure', async () => {
  const expected = await confirm();
  const before = await snapshot();
  const cases = [
    { endpoint: '/v1/customers', row: { object: 'customer', id: 'cus_Target', livemode: false, email: users[1].email } },
    { endpoint: '/v1/subscriptions', row: { object: 'subscription', id: 'sub_Target', livemode: false, customer: 'cus_Target', status: 'active', metadata: { userId: 'target' } } },
    { endpoint: '/v1/checkout/sessions', row: { object: 'checkout.session', id: 'cs_test_Target', livemode: false, status: 'open', mode: 'subscription', client_reference_id: 'target' } },
  ];
  for (const item of cases) {
    override = (url) => url.pathname === item.endpoint ? list([item.row]) : undefined;
    const body = await assertBlocked(await request('target/delete', expected), 409, 'STRIPE_REVIEW_REQUIRED');
    assert.equal(body.stripeReview.code, 'match');
    assert.deepEqual(await snapshot(), before);
  }
});

test('an anonymous open Checkout prevents erasure instead of being assigned to another user', async () => {
  override = (url) => url.pathname === '/v1/checkout/sessions'
    ? list([{ object: 'checkout.session', id: 'cs_test_Anonymous', livemode: false, status: 'open', mode: 'subscription' }]) : undefined;
  const before = await snapshot();
  const body = await assertBlocked(await request('target/delete', await confirm()), 409, 'STRIPE_REVIEW_REQUIRED');
  assert.equal(body.stripeReview.code, 'anonymous');
  assert.deepEqual(await snapshot(), before);
});

test('network failures, access failures, rate limits and invalid responses never become permission', async () => {
  const expected = await confirm();
  const before = await snapshot();
  for (const status of [401, 403, 429, 500]) {
    override = () => json({ error: 'fixture-private-stripe-error' }, status);
    const body = await assertBlocked(await request('target/delete', expected), 503, 'STRIPE_REVIEW_UNAVAILABLE');
    assert(!JSON.stringify(body).includes('fixture-private-stripe-error'));
    assert.deepEqual(await snapshot(), before);
  }
  override = () => { throw new Error('fixture-private-transport-error'); };
  const failed = await assertBlocked(await request('target/delete', expected), 503, 'STRIPE_REVIEW_UNAVAILABLE');
  assert(!JSON.stringify(failed).includes('fixture-private-transport-error'));
  override = () => json({ invalid: true });
  await assertBlocked(await request('target/delete', expected), 503, 'STRIPE_REVIEW_UNAVAILABLE');
  assert.deepEqual(await snapshot(), before);
});

test('test-mode credentials cannot allow erasure on a production server', async () => {
  process.env.NODE_ENV = 'production';
  const before = await snapshot();
  await assertBlocked(await request('target/delete', await confirm()), 503, 'STRIPE_REVIEW_UNAVAILABLE');
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('unauthenticated and non-operator callers never trigger Stripe or mutate accounts', async () => {
  const expected = await confirm();
  const before = await snapshot();
  assert.equal((await request('target/delete', expected, null)).status, 401);
  assert.equal((await request('target/delete', expected, users[2])).status, 403);
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('extra force flags and caller-supplied review results are rejected before Stripe', async () => {
  const expected = await confirm();
  const before = await snapshot();
  for (const extra of [{ force: true }, { skipReview: true }, { canDelete: true }, { stripeReview: { state: 'no_match', mayDelete: true } },
    { apiKey: 'fixture-supplied-key' }, { endpoint: 'https://example.invalid' }, { mode: 'live' }, { userId: 'other' }]) {
    await assertBlocked(await request('target/delete', { ...expected, ...extra }), 400, 'ACCOUNT_CONFIRMATION_REQUIRED');
    assert.deepEqual(await snapshot(), before);
  }
  assert.equal(calls.length, 0);
});

test('confirmation fields must be present, correct and bound to the current target', async () => {
  const expected = await confirm();
  const before = await snapshot();
  for (const change of [{ confirmed: false }, { confirmed: 'true' }, { farmId: '../farm-other' }, { email: 123 }, { revision: 'bad' }]) {
    await assertBlocked(await request('target/delete', { ...expected, ...change }), 400, 'ACCOUNT_CONFIRMATION_REQUIRED');
  }
  for (const field of Object.keys(expected)) {
    const missing: Record<string, unknown> = { ...expected };
    delete missing[field];
    await assertBlocked(await request('target/delete', missing), 400, 'ACCOUNT_CONFIRMATION_REQUIRED');
  }
  for (const change of [{ email: 'other@example.invalid' }, { farmId: 'farm-other' }, { revision: '0'.repeat(64) }]) {
    await assertBlocked(await request('target/delete', { ...expected, ...change }), 409, 'ACCOUNT_CHANGED');
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('query-string overrides do not skip the current review', async () => {
  const expected = await confirm();
  const before = await snapshot();
  await assertBlocked(await request('target/delete?force=true&skipReview=true&canDelete=true', expected), 409, 'ACCOUNT_DELETION_RELEASE_PENDING');
  assert.equal(calls.length, 4);
  assert.deepEqual(await snapshot(), before);
});

test('a previous no-match inspection is not reused and a new related record blocks the request', async () => {
  const inspection = await request('target/stripe-review');
  assert.equal((await inspection.json()).stripeReview.state, 'no_match');
  const before = await snapshot();
  override = (url) => url.pathname === '/v1/customers' ? list([{ object: 'customer', id: 'cus_NowPresent', livemode: false, email: users[1].email }]) : undefined;
  await assertBlocked(await request('target/delete', await confirm()), 409, 'STRIPE_REVIEW_REQUIRED');
  assert.equal(calls.length, 8);
  assert.deepEqual(await snapshot(), before);
});

test('operators, paid plans and shared farms stop before an external review', async () => {
  await assertBlocked(await request('operator/delete', await confirm('operator')), 409, 'ACCOUNT_DELETE_BLOCKED');
  for (const change of [{ plan: 'standard' }, { plan: 'pro' }, { farmId: 'farm-other' }, { role: 'member' }]) {
    await put('users.json', [users[0], { ...users[1], ...change }, users[2]]);
    const before = await snapshot();
    await assertBlocked(await request('target/delete', await confirm()), 409, 'ACCOUNT_DELETE_BLOCKED');
    assert.deepEqual(await snapshot(), before);
  }
  assert.equal(calls.length, 0);
});

test('local payment history blocks the request even for a Free account', async () => {
  const expected = await confirm();
  for (const file of ['bank-transfer-applications.json', 'stripeSubscriptions.json']) {
    await put(file, [{ userId: 'target', status: 'ended' }]);
    const before = await snapshot();
    await assertBlocked(await request('target/delete', expected), 409, 'ACCOUNT_DELETE_BLOCKED');
    assert.deepEqual(await snapshot(), before);
    await put(file, []);
  }
  assert.equal(calls.length, 0);
});

test('unknown targets, invalid path identifiers and malformed local billing data do not start a scan', async () => {
  const expected = await confirm();
  await assertBlocked(await request('missing/delete', expected), 404, 'USER_NOT_FOUND');
  await assertBlocked(await request('bad%20identifier/delete', expected), 400, 'ACCOUNT_CONFIRMATION_REQUIRED');
  await put('stripeSubscriptions.json', {});
  const before = await snapshot();
  await assertBlocked(await request('target/delete', expected), 503, 'ACCOUNT_REVIEW_UNAVAILABLE');
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('target edits during network I/O discard the evidence', async () => {
  const expected = await confirm();
  let afterEdit: [string, string][] = [];
  override = async (url) => {
    if (url.pathname === '/v1/account') {
      await updateUserProfileById('target', { farmName: 'Changed Fixture Farm', name: 'Changed Owner' });
      afterEdit = await snapshot();
    }
  };
  const body = await assertBlocked(await request('target/delete', expected), 409, 'ACCOUNT_CHANGED');
  assert.equal(body.stripeReview, undefined);
  assert.deepEqual(await snapshot(), afterEdit);
});

test('a new local contract during network I/O prevents use of an earlier no-match result', async () => {
  const expected = await confirm();
  let afterEdit: [string, string][] = [];
  override = async (url) => {
    if (url.pathname === '/v1/account') {
      await put('stripeSubscriptions.json', [{ userId: 'target', status: 'active' }]);
      afterEdit = await snapshot();
    }
  };
  const body = await assertBlocked(await request('target/delete', expected), 409, 'ACCOUNT_DELETE_BLOCKED');
  assert.equal(body.stripeReview, undefined);
  assert.deepEqual(await snapshot(), afterEdit);
});

test('operator access is rechecked after the external scan', async () => {
  const expected = await confirm();
  let afterEdit: [string, string][] = [];
  override = async (url) => {
    if (url.pathname === '/v1/account') {
      await updateUserActiveById('operator', false);
      afterEdit = await snapshot();
    }
  };
  const body = await assertBlocked(await request('target/delete', expected), 403, 'OPERATOR_REQUIRED');
  assert.equal(body.stripeReview, undefined);
  assert.deepEqual(await snapshot(), afterEdit);
});

test('target activity before and during review blocks the request without blocking other farms', async () => {
  const expected = await confirm();
  const releaseBefore = await beginAccountRequest('farm-target');
  try {
    await assertBlocked(await request('target/delete', expected), 409, 'ACCOUNT_BUSY');
    assert.equal(calls.length, 0);
  } finally { releaseBefore(); }
  let releaseDuring: (() => void) | undefined;
  override = async (url) => {
    if (url.pathname === '/v1/account') releaseDuring = await beginAccountRequest('farm-target');
  };
  const before = await snapshot();
  try {
    await assertBlocked(await request('target/delete', expected), 409, 'ACCOUNT_BUSY');
    assert.deepEqual(await snapshot(), before);
  } finally { releaseDuring?.(); }
});

test('a slow review holds no global data lock and a concurrent request cannot bypass it', async () => {
  const expected = await confirm();
  const entered = latch();
  const release = latch();
  override = async (url) => { if (url.pathname === '/v1/account') { entered.release(); await release.promise; } };
  const first = request('target/delete', expected);
  try {
    await bounded(entered.promise);
    await bounded(updateUserProfileById('other', { farmName: 'Other Still Working', name: 'Other Owner' }));
    const second = await assertBlocked(await bounded(request('target/delete', expected)), 503, 'STRIPE_REVIEW_UNAVAILABLE');
    assert.equal(second.stripeReview.code, 'busy');
  } finally { release.release(); }
  await assertBlocked(await first, 409, 'ACCOUNT_DELETION_RELEASE_PENDING');
  const saved = JSON.parse(await fs.readFile(path.join(root, 'users.json'), 'utf-8')) as FarmProUser[];
  assert.equal(saved.find((user) => user.id === 'other')?.farmName, 'Other Still Working');
  assert.equal(saved.find((user) => user.id === 'target')?.active, true);
  assert.deepEqual(await readAccountRetirements(), []);
});

test('an interrupted low-level erasure cannot be resumed through this closed HTTP boundary', async () => {
  const expected = await confirm();
  await markAccountRetired({ userId: 'target', farmId: 'farm-target', actorId: 'operator', retiredAt: new Date().toISOString(),
    accountDigest: expected.revision, emailDigest: accountEmailDigest(users[1].email) });
  const before = await snapshot();
  const preview = await request('target/deletion-preview');
  const body = await preview.json();
  assert.equal(body.resuming, true);
  assert.equal(body.canDelete, false);
  await assertBlocked(await request('target/delete', expected), 409, 'ACCOUNT_DELETE_IN_PROGRESS');
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('replaying an old request after fixture erasure does not produce an HTTP deletion success', async () => {
  const expected = await confirm();
  await deleteOperatorFreeAccount('target', 'operator', expected);
  const before = await snapshot();
  await assertBlocked(await request('target/delete', expected), 404, 'USER_NOT_FOUND');
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('mutating an in-process confirmation after the request starts cannot change the reviewed identity', async () => {
  const expected = await confirm();
  const entered = latch();
  const release = latch();
  override = async (url) => { if (url.pathname === '/v1/account') { entered.release(); await release.promise; } };
  const before = await snapshot();
  const pending = assessOperatorDeletionRequest('target', 'operator', expected);
  try {
    await bounded(entered.promise);
    expected.email = 'other@example.invalid';
    expected.farmId = 'farm-other';
    expected.revision = '0'.repeat(64);
  } finally { release.release(); }
  const result = await pending;
  assert.equal(result.body.code, 'ACCOUNT_DELETION_RELEASE_PENDING');
  assert.equal(result.body.deleted, false);
  assert.deepEqual(await snapshot(), before);
});

test('there is no alternate HTTP method or direct erasure-store reference in production route modules', async () => {
  const expected = await confirm();
  const before = await snapshot();
  for (const method of ['DELETE', 'PUT', 'PATCH']) assert.equal((await request('target/delete', expected, users[0], method)).status, 404);
  assert.equal((await request('target/delete')).status, 404);
  const directory = new URL('.', import.meta.url);
  for (const name of await fs.readdir(directory)) {
    if (!name.endsWith('.ts') || name.includes('.test.')) continue;
    const source = await fs.readFile(new URL(name, directory), 'utf-8');
    assert(!source.includes('deleteOperatorFreeAccount'), `Unreviewed erasure in production route ${name}`);
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});
