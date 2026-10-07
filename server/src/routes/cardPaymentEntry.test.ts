import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { createPasswordHash, createToken, updateUserEmailById, updateUserActiveById, type AuthUser, type FarmProUser } from '../authStore';
import { requireAuth } from '../authMiddleware';
import { getOperatorDeletionPreview, deleteOperatorFreeAccount } from '../operatorAccountDeletionStore';
import { requestOperatorAccountDeletion, cancelOperatorAccountDeletionRequest } from '../operatorAccountDeletionRequestService';
import { readAccountRetirements, withAccountDataLock } from '../accountDeletionGuard';
import { cardPaymentEntryRouter, getCardPaymentEntry } from './cardPaymentEntry';

// Disposable local fixtures only. Returning a URL never follows it or pays.
const realFetch = globalThis.fetch;
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_OPERATOR_EMAILS', 'FARMPRO_AUTH_SECRET', 'NODE_ENV'] as const;
let previous: Record<string, string | undefined>;
let root: string;
let origin: string;
let server: Server;
let users: FarmProUser[];
const offer = { plan: 'standard', billing: 'monthly', amountTaxIncluded: 2750, termsConfirmed: true, priceConfirmed: true };
function safe(user: FarmProUser): AuthUser {
  const { passwordHash, passwordSalt, ...value } = user;
  return { ...value, plan: value.plan || 'free' };
}
async function put(file: string, value: unknown) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), JSON.stringify(value));
}
async function snapshot(): Promise<[string, string][]> {
  async function walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return (await Promise.all(entries.map((item) => item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]))).flat();
  }
  return Promise.all((await walk(root)).sort().map(async (file) => [path.relative(root, file), await fs.readFile(file, 'utf-8')]));
}
async function post(body: unknown = offer, user: FarmProUser | null = users[1], suffix = '') {
  return realFetch(`${origin}/api/card-payment-entry${suffix}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${createToken(safe(user))}` } : {}) },
    body: JSON.stringify(body),
  });
}
async function confirmation(requestId = crypto.randomUUID()) {
  const preview = await getOperatorDeletionPreview('target', 'operator');
  return { requestId, farmId: preview.user.farmId, email: preview.user.email, revision: preview.revision,
    confirmed: true, bankApplicationHoldConfirmed: true };
}
async function accept() {
  const input = await confirmation();
  await requestOperatorAccountDeletion('target', 'operator', input);
  return input;
}
async function cancel(input: Awaited<ReturnType<typeof confirmation>>) {
  return cancelOperatorAccountDeletionRequest('target', 'operator', {
    requestId: input.requestId, farmId: input.farmId, email: input.email, confirmed: true,
  });
}

beforeEach(async () => {
  previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-card-entry-fixture-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_OPERATOR_EMAILS = 'operator@example.invalid';
  process.env.FARMPRO_AUTH_SECRET = 'fixture-not-a-production-key';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('fixture-password');
  users = ['operator', 'target', 'other'].map((id) => ({ id, farmId: `farm-${id}`, farmName: `${id} Fixture`,
    name: 'Fixture Owner', email: `${id}@example.invalid`, active: true, role: 'owner', plan: 'free', ...credentials }));
  await put('users.json', users);
  await put('stripeSubscriptions.json', []);
  await put('stripeWebhookEvents.json', []);
  await put('bank-transfer-applications.json', []);
  await put('farms/farm-target/cattle.json', [{ id: 'target-fixture-cow' }]);
  await put('farms/farm-other/cattle.json', [{ id: 'other-fixture-cow' }]);
  globalThis.fetch = async () => { throw new Error('Unexpected external network access in card entry fixture'); };
  const app = express();
  app.use(express.json());
  app.use('/api/card-payment-entry', requireAuth, cardPaymentEntryRouter);
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

test('both existing offers return a checked identity-bound URL without changing files or calling Stripe', async () => {
  const before = await snapshot();
  for (const [plan, amount, paymentPath] of [
    ['standard', 2750, '/4gM7sL51R5qM8pH5nheME04'], ['pro', 5500, '/5kQ7sL1LPFbPafS99DxeME05'],
  ] as const) {
    const response = await post({ ...offer, plan, amountTaxIncluded: amount });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    const body = await response.json();
    const url = new URL(body.url);
    assert.equal(url.origin, 'https://buy.stripe.com');
    assert.equal(url.pathname, paymentPath);
    assert.equal(url.searchParams.get('client_reference_id'), 'target');
    assert.equal(url.searchParams.get('locked_prefilled_email'), users[1].email);
    assert.equal(body.amountTaxIncluded, amount);
    assert.equal(body.stripeAdmissionControlled, false);
    assert.equal(body.userId, 'target');
    assert.equal(body.farmId, 'farm-target');
  }
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await readAccountRetirements(), []);
});

test('no authorization or invalid authorization cannot obtain a card link', async () => {
  const before = await snapshot();
  assert.equal((await post(offer, null)).status, 401);
  const response = await realFetch(`${origin}/api/card-payment-entry`, { method: 'POST',
    headers: { Authorization: 'Bearer invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(offer) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).url, undefined);
  assert.deepEqual(await snapshot(), before);
});

test('loading or using alternate methods does not obtain a link or change data', async () => {
  const before = await snapshot();
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE']) {
    const response = await realFetch(`${origin}/api/card-payment-entry`, { method,
      headers: { Authorization: `Bearer ${createToken(safe(users[1]))}` } });
    assert.equal(response.status, 404);
    assert(!(await response.text()).includes('buy.stripe.com'));
  }
  assert.deepEqual(await snapshot(), before);
});

test('missing confirmations, invalid amounts and caller-supplied URLs or identities are rejected', async () => {
  const before = await snapshot();
  const changes = [{ termsConfirmed: false }, { priceConfirmed: false }, { billing: 'yearly' },
    { plan: 'free' }, { amountTaxIncluded: 1 }, { amountTaxIncluded: '2750' }, { userId: 'other' },
    { farmId: 'farm-other' }, { email: 'other@example.invalid' }, { url: 'https://example.invalid' }, { force: true }];
  for (const change of changes) {
    const response = await post({ ...offer, ...change });
    assert([400, 409].includes(response.status));
    assert.equal((await response.json()).url, undefined);
  }
  assert.equal((await post([])).status, 400);
  assert.deepEqual(await snapshot(), before);
});

test('an accepted deletion request blocks card entry without changing login plan or cow data', async () => {
  await accept();
  const before = await snapshot();
  const response = await post();
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, 'ACCOUNT_DELETION_CARD_ENTRY_HOLD');
  assert.equal(body.url, undefined);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await readAccountRetirements(), []);
});

test('another farm is not blocked by the target request', async () => {
  await accept();
  const before = await snapshot();
  const response = await post(offer, users[2]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).userId, 'other');
  assert.deepEqual(await snapshot(), before);
});

test('cancellation allows a fresh entry but starts no payment and returns no deletion permission', async () => {
  const input = await accept();
  const cancelled = await cancel(input);
  assert.equal(cancelled.canDelete, false);
  const before = await snapshot();
  assert.equal((await post()).status, 200);
  assert.deepEqual(await snapshot(), before);
});

test('replaying an old cancellation does not release a newer card-entry hold', async () => {
  const first = await accept();
  await cancel(first);
  await accept();
  const result = await cancel(first);
  assert.equal(result.bankApplicationsBlockedByRequest, true);
  assert.equal((await post()).status, 409);
});

test('renaming the email does not bypass a pending account/farm hold', async () => {
  await accept();
  await updateUserEmailById('target', 'changed@example.invalid');
  const response = await post();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).url, undefined);
});

test('the server uses current stored email instead of stale authentication data', async () => {
  await updateUserEmailById('target', 'latest@example.invalid');
  const before = await snapshot();
  const body = await getCardPaymentEntry(safe(users[1]), offer);
  assert.equal(new URL(body.url).searchParams.get('locked_prefilled_email'), 'latest@example.invalid');
  assert.deepEqual(await snapshot(), before);
});

test('current stopped or missing accounts reject even stale in-process authentication objects', async () => {
  await updateUserActiveById('target', false);
  await assert.rejects(getCardPaymentEntry(safe(users[1]), offer), /CARD_ACCOUNT_UNAVAILABLE/);
  assert.equal((await post()).status, 401);
  await put('users.json', [users[0], users[2]]);
  await assert.rejects(getCardPaymentEntry(safe(users[1]), offer), /CARD_ACCOUNT_UNAVAILABLE/);
});

test('retired accounts cannot use an existing token or stale identity to get a new link', async () => {
  const preview = await getOperatorDeletionPreview('target', 'operator');
  await deleteOperatorFreeAccount('target', 'operator', { farmId: preview.user.farmId, email: preview.user.email,
    revision: preview.revision, confirmed: true });
  assert.equal((await post()).status, 401);
  await assert.rejects(getCardPaymentEntry(safe(users[1]), offer), /CARD_ACCOUNT_UNAVAILABLE/);
});

test('corrupt or unreadable request state never returns a link and is never replaced', async () => {
  for (const value of [{}, { version: 1, records: [{}] }, { version: 2, records: [] }]) {
    await put('account-deletion-requests.json', value);
    const before = await snapshot();
    const response = await post();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).url, undefined);
    assert.deepEqual(await snapshot(), before);
  }
});

test('symbolic-link request state is rejected instead of followed as empty', async () => {
  await put('fixture-empty.json', { version: 1, records: [] });
  await fs.symlink(path.join(root, 'fixture-empty.json'), path.join(root, 'account-deletion-requests.json'));
  const before = await snapshot();
  assert.equal((await post()).status, 503);
  assert.deepEqual(await snapshot(), before);
});

test('query overrides cannot bypass a fresh hold check', async () => {
  await accept();
  const response = await post(offer, users[1], '?force=true&skipReview=true&userId=other');
  assert.equal(response.status, 409);
  assert.equal((await response.json()).url, undefined);
});

test('request-first ordering rejects card entry under the same account lock', async () => {
  const input = await confirmation();
  await withAccountDataLock(async () => {
    await requestOperatorAccountDeletion('target', 'operator', input);
    await assert.rejects(getCardPaymentEntry(safe(users[1]), offer), /ACCOUNT_DELETION_CARD_ENTRY_HOLD/);
  });
});

test('a link issued before acceptance is not claimed to be revoked; subsequent entry is blocked', async () => {
  const body = await getCardPaymentEntry(safe(users[1]), offer);
  assert.equal(body.stripeAdmissionControlled, false);
  const input = await confirmation();
  const accepted = await requestOperatorAccountDeletion('target', 'operator', input);
  assert.equal(accepted.stripeAdmissionControlled, false);
  assert.equal(accepted.canDelete, false);
  assert.equal(accepted.deleted, false);
  await assert.rejects(getCardPaymentEntry(safe(users[1]), offer), /ACCOUNT_DELETION_CARD_ENTRY_HOLD/);
});

test('application source mounts card entry after requireAuth and leaves raw Stripe webhook before JSON', async () => {
  const source = await fs.readFile(new URL('../app.ts', import.meta.url), 'utf-8');
  assert(source.indexOf("app.use('/api', requireAuth)") < source.indexOf("app.use('/api/card-payment-entry', cardPaymentEntryRouter)"));
  assert(source.indexOf("app.post('/api/stripe/webhook'") < source.indexOf('app.use(express.json'));
});
