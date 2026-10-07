import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { createPasswordHash, createToken, updateUserActiveById, updateUserProfileById, type AuthUser, type FarmProUser } from '../authStore';
import { requireAuth } from '../authMiddleware';
import { operatorUsersRouter } from './operatorUsers';
import { readAccountRetirements } from '../accountDeletionGuard';

// Only fixture files and loopback HTTP are real. Every Stripe request is mocked.
const realFetch = globalThis.fetch;
const keys = ['FARMPRO_DATA_DIR', 'FARMPRO_AUTH_SECRET', 'FARMPRO_OPERATOR_EMAILS',
  'FARMPRO_STRIPE_REVIEW_KEY', 'FARMPRO_STRIPE_REVIEW_ACCOUNT_ID', 'NODE_ENV'] as const;
let previous: Record<string, string | undefined>;
let root: string;
let origin: string;
let server: Server;
let users: FarmProUser[];
let calls: URL[];
let override: (url: URL) => unknown | Promise<unknown>;
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const list = (data: unknown[] = []) => ({ object: 'list', has_more: false, data });
function safe(user: FarmProUser): AuthUser {
  const { passwordHash, passwordSalt, ...value } = user;
  return { ...value, plan: value.plan || 'free' };
}
async function put(file: string, data: unknown) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), JSON.stringify(data));
}
async function snapshot(): Promise<[string, string][]> {
  const visit = async (directory: string): Promise<string[]> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const values = await Promise.all(entries.map((entry) => entry.isDirectory()
      ? visit(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
    return values.flat();
  };
  return Promise.all((await visit(root)).sort().map(async (file) => [path.relative(root, file), await fs.readFile(file, 'utf-8')]));
}
async function request(id = 'target', actor: FarmProUser | null = users[0], extra = '', method = 'GET') {
  return realFetch(`${origin}/api/operator/users/${id}/stripe-review${extra}`, {
    method, headers: actor ? { Authorization: `Bearer ${createToken(safe(actor))}` } : {},
  });
}
beforeEach(async () => {
  previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-stripe-review-fixture-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'fixture-only-not-a-real-auth-secret';
  process.env.FARMPRO_OPERATOR_EMAILS = 'operator@example.invalid';
  process.env.FARMPRO_STRIPE_REVIEW_KEY = 'rk_test_FixtureReadOnlyKey';
  process.env.FARMPRO_STRIPE_REVIEW_ACCOUNT_ID = 'acct_Fixture';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('fixture-password');
  users = ['operator', 'target', 'other'].map((id) => ({ id, farmId: `farm-${id}`, email: `${id}@example.invalid`,
    farmName: `${id} Fixture Farm`, name: 'Fixture Owner', role: 'owner', plan: 'free', active: true, ...credentials }));
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
    const value = await override(url);
    return json(value !== undefined ? value : url.pathname === '/v1/account' ? { object: 'account', id: 'acct_Fixture' } : list());
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
  // root is allocated by mkdtemp above, never a production directory.
  if (root) await fs.rm(root, { recursive: true, force: true });
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});

test('operator-only mounted review returns no-match evidence without any file changes or delete permission', async () => {
  const before = await snapshot();
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  const body = await response.json();
  assert.equal(body.userId, 'target');
  assert.equal(body.farmId, 'farm-target');
  assert.equal(body.canDelete, false);
  assert.equal(body.stripeReview.state, 'no_match');
  assert.equal(body.stripeReview.mayDelete, false);
  assert.equal(calls.length, 4);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await readAccountRetirements(), []);
});

test('missing review configuration does not become an empty successful Stripe result', async () => {
  delete process.env.FARMPRO_STRIPE_REVIEW_KEY;
  const before = await snapshot();
  const response = await request();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.canDelete, false);
  assert.equal(body.stripeReview.code, 'configuration');
  assert.equal(body.stripeReview.state, 'unavailable');
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('no authentication and non-operator authentication cannot inspect Stripe', async () => {
  const before = await snapshot();
  assert.equal((await request('target', null)).status, 401);
  assert.equal((await request('target', users[2])).status, 403);
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('unknown accounts and invalid identifiers are rejected before Stripe access', async () => {
  const before = await snapshot();
  assert.equal((await request('missing')).status, 404);
  assert.equal((await request('bad%20identifier')).status, 400);
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('operator, paid plans and shared farms stay protected and cause no external scan', async () => {
  assert.equal((await request('operator')).status, 409);
  for (const change of [{ plan: 'standard' }, { plan: 'pro' }, { farmId: 'farm-other' }, { role: 'member' }]) {
    await put('users.json', [users[0], { ...users[1], ...change }, users[2]]);
    const before = await snapshot();
    assert.equal((await request()).status, 409);
    assert.deepEqual(await snapshot(), before);
  }
  assert.equal(calls.length, 0);
});

test('Free with bank or Stripe history does not bypass the existing local protection', async () => {
  for (const file of ['bank-transfer-applications.json', 'stripeSubscriptions.json']) {
    await put(file, [{ userId: 'target', status: 'ended' }]);
    const before = await snapshot();
    const response = await request();
    assert.equal(response.status, 409);
    assert.equal((await response.json()).canDelete, false);
    assert.deepEqual(await snapshot(), before);
    await put(file, []);
  }
  assert.equal(calls.length, 0);
});

test('request query cannot replace the stored identity, credentials or Stripe endpoint', async () => {
  override = (url) => url.pathname === '/v1/customers' ? list([{
    id: 'cus_Fixture', object: 'customer', livemode: false, email: users[1].email.toUpperCase(), metadata: {},
    name: 'Private remote name', phone: 'Private remote phone',
  }]) : undefined;
  const before = await snapshot();
  const response = await request('target', users[0], '?email=other%40example.invalid&endpoint=https%3A%2F%2Fexample.invalid&key=injected&mode=live');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.stripeReview.code, 'match');
  assert.equal(body.canDelete, false);
  assert.equal(body.stripeReview.mode, 'test');
  assert(!JSON.stringify(body).includes('Private remote'));
  assert(!JSON.stringify(body).includes(users[1].email));
  assert(!JSON.stringify(body).includes('rk_test_'));
  assert.deepEqual(await snapshot(), before);
});

test('target changes during Stripe I/O discard the evidence rather than bind it to a stale account', async () => {
  override = async (url) => {
    if (url.pathname === '/v1/customers') await updateUserProfileById('target', { farmName: 'Changed Fixture', name: 'Fixture Owner' });
  };
  const response = await request();
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.canDelete, false);
  assert.equal(body.stripeReview, undefined);
  assert.deepEqual(await readAccountRetirements(), []);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'users.json'), 'utf-8')).length, 3);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'farms/farm-target/cattle.json'), 'utf-8'))[0].id, 'target-cow');
});

test('a newly recorded local contract during Stripe I/O also invalidates the result', async () => {
  override = async (url) => {
    if (url.pathname === '/v1/subscriptions') await put('bank-transfer-applications.json', [{ userId: 'target', status: 'pending_payment' }]);
  };
  const response = await request();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).canDelete, false);
  assert.deepEqual(await readAccountRetirements(), []);
});

test('operator access is rechecked after network I/O', async () => {
  override = async (url) => {
    if (url.pathname === '/v1/customers') await updateUserActiveById('operator', false);
  };
  const response = await request();
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.canDelete, false);
  assert.equal(body.stripeReview, undefined);
  assert.deepEqual(await readAccountRetirements(), []);
});

test('malformed local payment data is not replaced or treated as no history', async () => {
  await put('stripeSubscriptions.json', { invalid: true });
  const before = await snapshot();
  assert.equal((await request()).status, 503);
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});

test('the inspection endpoint has no POST action', async () => {
  const before = await snapshot();
  assert.equal((await request('target', users[0], '', 'POST')).status, 404);
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(), before);
});
