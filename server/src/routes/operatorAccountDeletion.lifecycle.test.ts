import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import {
  authenticate, createPasswordHash, createToken, createUser, listUsersForOperator,
  resetPassword, updateUserActiveById, updateUserEmailById, updateUserPasswordById,
  updateUserPlan, updateUserPlanById, updateUserProfileById, verifyToken,
  type AuthUser, type FarmProUser,
} from '../authStore';
import { requireAuth } from '../authMiddleware';
import { operatorUsersRouter } from './operatorUsers';
import { deleteOperatorFreeAccount, getOperatorDeletionPreview } from '../operatorAccountDeletionStore';
import { readAccountRetirements } from '../accountDeletionGuard';
import { getActiveSubscriptionSummary, stripeWebhookHandler } from '../stripeWebhook';

// All writes, signatures and HTTP requests in this file use disposable fixtures.
// No Stripe API calls, production keys or application accounts are used.
const IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];
const FIXTURE_SECRET = 'fixture-webhook-secret-not-a-stripe-credential';
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_OPERATOR_EMAILS', 'FARMPRO_AUTH_SECRET', 'NODE_ENV',
  'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_TEST_SECRET'] as const;
const originalEnv = Object.fromEntries(envKeys.map((name) => [name, process.env[name]]));
let root: string;
let server: Server;
let origin: string;
let users: FarmProUser[];
const files = ['users.json', 'stripeSubscriptions.json', 'stripeWebhookEvents.json',
  'bank-transfer-applications.json', 'farms/farm-target/cattle.json', 'farms/farm-other/cattle.json'];

function safe(user: FarmProUser): AuthUser {
  const { passwordSalt, passwordHash, ...value } = user;
  return { ...value, plan: value.plan || 'free' };
}
async function put(file: string, value: unknown) {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value));
}
async function raw(file: string) { return fs.readFile(path.join(root, file), 'utf-8'); }
async function data(file: string) { return JSON.parse(await raw(file)); }
async function snapshot() { return Promise.all(files.map(raw)); }
async function confirmTarget() {
  const preview = await getOperatorDeletionPreview(IDS[1], IDS[0]);
  return { farmId: preview.user.farmId, email: preview.user.email, revision: preview.revision, confirmed: true };
}
function checkout(id: string, overrides: Record<string, unknown> = {}) {
  return { id, type: 'checkout.session.completed', data: { object: {
    id: 'cs_fixture_checkout', mode: 'subscription', payment_status: 'paid', currency: 'jpy', amount_total: 2750,
    subscription: 'sub_fixture_target', client_reference_id: IDS[1], customer_details: { email: 'target@example.invalid' },
    ...overrides,
  } } };
}
async function webhook(event: unknown, signatureOptions: { bad?: boolean; timestamp?: number } = {}) {
  const body = JSON.stringify(event);
  const timestamp = signatureOptions.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', signatureOptions.bad ? 'wrong-fixture-secret' : FIXTURE_SECRET)
    .update(`${timestamp}.${body}`).digest('hex');
  return fetch(`${origin}/api/stripe/webhook`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${signature}` }, body });
}
async function activeRequest(active: boolean) {
  return fetch(`${origin}/api/operator/users/${IDS[1]}/active`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${createToken(safe(users[0]))}` },
    body: JSON.stringify({ active }),
  });
}
function subscription(userId = IDS[1], status = 'active') {
  return { subscriptionId: 'sub_fixture_target', userId, status, plan: 'standard', billing: 'monthly', updatedAt: '2026-10-01T00:00:00.000Z' };
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
async function waitForLatch(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('fixture synchronization timed out')), 4000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-lifecycle-fixture-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_OPERATOR_EMAILS = 'operator@example.invalid';
  process.env.FARMPRO_AUTH_SECRET = 'fixture-auth-secret';
  process.env.NODE_ENV = 'test';
  process.env.STRIPE_WEBHOOK_SECRET = FIXTURE_SECRET;
  delete process.env.STRIPE_WEBHOOK_TEST_SECRET;
  const credentials = createPasswordHash('fixture-password');
  users = ['operator', 'target', 'other'].map((label, index) => ({
    id: IDS[index], farmId: `farm-${label}`, farmName: `${label} Fixture`, name: 'Fixture Owner',
    email: `${label}@example.invalid`, role: 'owner', active: true, plan: 'free', ...credentials,
  }));
  await put('users.json', users);
  await put('stripeSubscriptions.json', []);
  await put('stripeWebhookEvents.json', []);
  await put('bank-transfer-applications.json', []);
  await put('farms/farm-target/cattle.json', [{ id: 'fixture-target-cow' }]);
  await put('farms/farm-other/cattle.json', [{ id: 'fixture-other-cow' }]);
  const app = express();
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
  app.use(express.json());
  app.use('/api/operator/users', requireAuth, operatorUsersRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (root) await fs.rm(root, { recursive: true, force: true });
  for (const name of envKeys) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('valid signed Checkout with a recorded account ID keeps the existing paid activation', async () => {
  const otherFarm = await raw('farms/farm-other/cattle.json');
  const response = await webhook(checkout('evt_fixture_valid'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  const stored = await data('users.json') as FarmProUser[];
  assert.equal(stored.find((item) => item.id === IDS[1])?.plan, 'standard');
  assert.deepEqual(stored.find((item) => item.id === IDS[2]), users[2]);
  assert.equal(await raw('farms/farm-other/cattle.json'), otherFarm);
  assert.equal((await data('stripeSubscriptions.json'))[0].userId, IDS[1]);
});

test('invalid signatures, expired signatures and malformed event identities do not change records', async () => {
  const before = await snapshot();
  assert.equal((await webhook(checkout('evt_fixture_bad_signature'), { bad: true })).status, 400);
  assert.equal((await webhook(checkout('evt_fixture_old_signature'), { timestamp: Math.floor(Date.now() / 1000) - 1000 })).status, 400);
  for (const payload of [null, [], {}, { id: '', type: 'checkout.session.completed' }, { id: 'evt_fixture_invalid', type: 4 }]) {
    assert.equal((await webhook(payload)).status, 400);
  }
  assert.deepEqual(await snapshot(), before);
});

test('a malformed supplied reference never falls back to the matching email', async () => {
  const before = await snapshot();
  for (const value of ['bad-id', '-'.repeat(36), ' ', 42, {}, []]) {
    assert.equal((await webhook(checkout('evt_fixture_invalid_reference', { client_reference_id: value }))).status, 500);
    assert.deepEqual(await snapshot(), before);
  }
});

test('an unknown explicit UUID does not fall back to email either', async () => {
  const before = await snapshot();
  assert.equal((await webhook(checkout('evt_fixture_unknown_id', { client_reference_id: '44444444-4444-4444-8444-444444444444' }))).status, 500);
  assert.deepEqual(await snapshot(), before);
});

test('legacy email-only Checkout still works for an account whose email was never retired', async () => {
  assert.equal((await webhook(checkout('evt_fixture_legacy', { client_reference_id: null }))).status, 200);
  assert.equal((await data('stripeSubscriptions.json'))[0].userId, IDS[1]);
});

test('a late email-only Checkout cannot assign payment to a new registration at the retired email', async () => {
  await deleteOperatorFreeAccount(IDS[1], IDS[0], await confirmTarget());
  const recreated = await createUser({ farmId: 'farm-new-registration', farmName: 'New Fixture', name: 'New Owner',
    email: users[1].email, password: 'fixture-new-password' });
  const before = await raw('users.json');
  assert.equal((await webhook(checkout('evt_fixture_old_email', { client_reference_id: null }))).status, 500);
  assert.equal(await raw('users.json'), before);
  assert.equal((await data('users.json')).find((item: FarmProUser) => item.id === recreated.id).plan, 'free');
  assert.deepEqual(await data('stripeSubscriptions.json'), []);
  assert.deepEqual(await data('stripeWebhookEvents.json'), []);
  await assert.rejects(updateUserPlan(users[1].email, 'pro'), /BILLING_ACCOUNT_REVIEW_REQUIRED/);
});

test('a late explicit retired ID cannot reach the newly registered account', async () => {
  await deleteOperatorFreeAccount(IDS[1], IDS[0], await confirmTarget());
  await createUser({ farmId: 'farm-new-registration', farmName: 'New Fixture', name: 'New Owner',
    email: users[1].email, password: 'fixture-new-password' });
  const before = await raw('users.json');
  assert.equal((await webhook(checkout('evt_fixture_old_id'))).status, 500);
  assert.equal(await raw('users.json'), before);
  assert.deepEqual(await data('stripeSubscriptions.json'), []);
});

test('a new explicit ID at the reused email can be associated with a new subscription', async () => {
  await deleteOperatorFreeAccount(IDS[1], IDS[0], await confirmTarget());
  const recreated = await createUser({ farmId: 'farm-new-registration', farmName: 'New Fixture', name: 'New Owner',
    email: users[1].email, password: 'fixture-new-password' });
  assert.equal((await webhook(checkout('evt_fixture_new_id', { client_reference_id: recreated.id, subscription: 'sub_fixture_new_registration' }))).status, 200);
  assert.equal((await data('stripeSubscriptions.json'))[0].userId, recreated.id);
  await assert.rejects(fs.stat(path.join(root, 'farms/farm-target')), { code: 'ENOENT' });
});

test('an existing subscription cannot be reassigned to a different account by ID or email', async () => {
  await put('stripeSubscriptions.json', [subscription(IDS[2])]);
  const before = await snapshot();
  for (const reference of [IDS[1], null]) {
    assert.equal((await webhook(checkout('evt_fixture_wrong_owner', { client_reference_id: reference }))).status, 500);
    assert.deepEqual(await snapshot(), before);
  }
});

test('global and legacy subscription owner conflicts fail before publishing a merged ledger', async () => {
  await put('stripeSubscriptions.json', [subscription(IDS[1])]);
  await put('farms/farm-demo/stripeSubscriptions.json', [{ ...subscription(IDS[2]), updatedAt: '2026-10-02T00:00:00.000Z' }]);
  const before = await snapshot();
  const legacy = await raw('farms/farm-demo/stripeSubscriptions.json');
  assert.equal((await webhook(checkout('evt_fixture_legacy_conflict'))).status, 500);
  assert.deepEqual(await snapshot(), before);
  assert.equal(await raw('farms/farm-demo/stripeSubscriptions.json'), legacy);
});

test('a Checkout received after known subscription deactivation cannot reactivate that subscription', async () => {
  await put('stripeSubscriptions.json', [subscription(IDS[1], 'inactive')]);
  const before = await snapshot();
  assert.equal((await webhook(checkout('evt_fixture_after_end'))).status, 500);
  assert.deepEqual(await snapshot(), before);
});

test('duplicate Checkout objects with different event IDs do not overwrite a newer plan', async () => {
  assert.equal((await webhook(checkout('evt_fixture_first'))).status, 200);
  await updateUserPlanById(IDS[1], 'pro');
  const before = await raw('users.json');
  assert.equal((await webhook(checkout('evt_fixture_duplicate_object'))).status, 200);
  assert.equal(await raw('users.json'), before);
  assert.equal((await data('stripeSubscriptions.json')).length, 1);
  assert.equal((await data('stripeWebhookEvents.json')).length, 2);
});

test('parallel deliveries of the same event publish one subscription and one event record', async () => {
  const results = await Promise.all(Array.from({ length: 4 }, () => webhook(checkout('evt_fixture_repeat'))));
  assert(results.every((response) => response.status === 200));
  assert.equal((await data('stripeSubscriptions.json')).length, 1);
  assert.equal((await data('stripeWebhookEvents.json')).length, 1);
});

test('independent parallel Checkout events and legacy-summary reads preserve both account associations', async () => {
  await put('farms/farm-demo/stripeSubscriptions.json', [{ ...subscription(IDS[0]), subscriptionId: 'sub_fixture_legacy_operator' }]);
  const results = await Promise.all([
    webhook(checkout('evt_fixture_target')),
    webhook(checkout('evt_fixture_other', { subscription: 'sub_fixture_other', client_reference_id: IDS[2] })),
    getActiveSubscriptionSummary(IDS[0]),
  ]);
  assert.equal((results[0] as Response).status, 200);
  assert.equal((results[1] as Response).status, 200);
  const stored = await data('stripeSubscriptions.json');
  assert.equal(stored.length, 3);
  assert.equal(stored.find((item: { subscriptionId: string }) => item.subscriptionId === 'sub_fixture_target').userId, IDS[1]);
  assert.equal(stored.find((item: { subscriptionId: string }) => item.subscriptionId === 'sub_fixture_other').userId, IDS[2]);
  assert.equal((await data('stripeWebhookEvents.json')).length, 2);
});

test('when deletion starts first, a waiting Checkout cannot recreate the account or farm', { timeout: 10000 }, async (t) => {
  const expected = await confirmTarget();
  const reached = latch();
  const resume = latch();
  const realRemove = fs.rm;
  const removal = t.mock.method(fs, 'rm', async (...args: Parameters<typeof fs.rm>) => {
    if (String(args[0]) === path.join(root, 'farms/farm-target')) { reached.release(); await resume.promise; }
    return realRemove(...args);
  });
  t.after(() => { resume.release(); removal.mock.restore(); });
  const deletion = deleteOperatorFreeAccount(IDS[1], IDS[0], expected);
  try {
    await waitForLatch(reached.promise);
    const payment = webhook(checkout('evt_fixture_after_deletion_started'));
    resume.release();
    assert.equal((await deletion).deleted, true);
    assert.equal((await payment).status, 500);
    assert(!(await data('users.json')).some((item: FarmProUser) => item.id === IDS[1]));
    assert.deepEqual(await data('stripeSubscriptions.json'), []);
    await assert.rejects(fs.stat(path.join(root, 'farms/farm-target')), { code: 'ENOENT' });
  } finally { resume.release(); removal.mock.restore(); await deletion.catch(() => undefined); }
});

test('when Checkout starts first, deletion waits and rejects the newly paid account', { timeout: 10000 }, async (t) => {
  const expected = await confirmTarget();
  const reached = latch();
  const resume = latch();
  const realRename = fs.rename;
  const publication = t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    if (String(args[1]) === path.join(root, 'stripeSubscriptions.json')) { reached.release(); await resume.promise; }
    return realRename(...args);
  });
  t.after(() => { resume.release(); publication.mock.restore(); });
  const payment = webhook(checkout('evt_fixture_before_deletion'));
  try {
    await waitForLatch(reached.promise);
    const rejectedDeletion = assert.rejects(deleteOperatorFreeAccount(IDS[1], IDS[0], expected), /ACCOUNT_DELETE_BLOCKED/);
    resume.release();
    assert.equal((await payment).status, 200);
    await rejectedDeletion;
    assert.equal((await data('users.json')).find((item: FarmProUser) => item.id === IDS[1]).plan, 'standard');
    assert.equal((await data('stripeSubscriptions.json'))[0].userId, IDS[1]);
    assert.deepEqual(await readAccountRetirements(), []);
    assert((await fs.stat(path.join(root, 'farms/farm-target'))).isDirectory());
  } finally { resume.release(); publication.mock.restore(); await payment.catch(() => undefined); }
});

test('interrupted deletion rejects even unchanged active=true through the operator API', async () => {
  const token = createToken(safe(users[1]));
  await put('farms/farm-demo/pendingPasswordResets.json', { invalidFixture: true });
  await assert.rejects(deleteOperatorFreeAccount(IDS[1], IDS[0], await confirmTarget()), /ACCOUNT_DATA_REVIEW_REQUIRED/);
  const before = await raw('users.json');
  assert.equal((await data('users.json')).find((item: FarmProUser) => item.id === IDS[1]).active, true);
  for (const active of [true, false]) {
    const response = await activeRequest(active);
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /削除処理中/);
    assert.equal(await raw('users.json'), before);
  }
  assert.equal(await verifyToken(token), null);
  assert.equal(await authenticate(users[1].email, 'fixture-password'), null);
  const listed = (await listUsersForOperator()).find((item) => item.id === IDS[1]);
  assert.equal(listed?.active, false);
  assert(listed && 'accountDeletionPending' in listed && listed.accountDeletionPending);
});

test('all targeted mutations reject a retired row, including no-op profile, email and plan updates', async () => {
  await put('farms/farm-demo/pendingPasswordResets.json', { invalidFixture: true });
  await assert.rejects(deleteOperatorFreeAccount(IDS[1], IDS[0], await confirmTarget()), /ACCOUNT_DATA_REVIEW_REQUIRED/);
  const before = await raw('users.json');
  const operations = [
    () => updateUserProfileById(IDS[1], { farmName: users[1].farmName, name: users[1].name }),
    () => updateUserEmailById(IDS[1], users[1].email),
    () => updateUserPlanById(IDS[1], 'free'),
    () => updateUserActiveById(IDS[1], true),
    () => updateUserPasswordById(IDS[1], 'new-fixture-password'),
    () => resetPassword(users[1].email, 'new-fixture-password', IDS[1]),
  ];
  for (const operation of operations) {
    await assert.rejects(operation(), /ACCOUNT_RETIRED/);
    assert.equal(await raw('users.json'), before);
  }
});

test('ordinary account operations and retry still work while another account is pending deletion', async () => {
  await put('farms/farm-demo/pendingPasswordResets.json', { invalidFixture: true });
  await assert.rejects(deleteOperatorFreeAccount(IDS[1], IDS[0], await confirmTarget()), /ACCOUNT_DATA_REVIEW_REQUIRED/);
  await updateUserActiveById(IDS[2], false);
  assert.equal((await updateUserActiveById(IDS[2], true)).active, true);
  assert.equal((await updateUserProfileById(IDS[2], { farmName: 'Other Updated', name: 'Other Owner' })).farmName, 'Other Updated');
  await put('farms/farm-demo/pendingPasswordResets.json', []);
  assert.equal((await deleteOperatorFreeAccount(IDS[1], IDS[0], await confirmTarget())).deleted, true);
  assert.equal((await data('users.json')).find((item: FarmProUser) => item.id === IDS[2]).farmName, 'Other Updated');
});
