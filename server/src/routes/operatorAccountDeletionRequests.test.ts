import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { PathLike } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import {
  authenticate, createPasswordHash, createToken, updateUserActiveById, updateUserEmailById,
  updateUserProfileById, verifyToken, type AuthUser, type FarmProUser,
} from '../authStore';
import { requireAuth } from '../authMiddleware';
import { operatorUsersRouter } from './operatorUsers';
import { bankTransferApplicationsRouter } from './bankTransferApplications';
import { accountEmailDigest, markAccountRetired, readAccountRetirements } from '../accountDeletionGuard';
import { beginAccountRequest } from '../accountRequestLease';
import { getOperatorDeletionPreview } from '../operatorAccountDeletionStore';
import { readAccountDeletionRequests, assertNewBankApplicationAllowed } from '../accountDeletionRequestStore';
import {
  requestOperatorAccountDeletion, cancelOperatorAccountDeletionRequest, getOperatorDeletionRequestState,
} from '../operatorAccountDeletionRequestService';
import {
  activateBankTransferApplication, createOrGetPendingBankTransferApplication,
  expireEndedBankTransferContracts, expireOverdueBankTransferApplications, listBankTransferApplications,
  type BankTransferApplication,
} from '../bankTransferApplicationStore';

// All files are under a mkdtemp fixture. Actual HTTP is loopback only; email is
// mocked and unexpected external requests fail. No real accounts are exercised.
const realFetch = globalThis.fetch;
const REQUEST_FILE = 'account-deletion-requests.json';
const envKeys = ['FARMPRO_DATA_DIR', 'FARMPRO_OPERATOR_EMAILS', 'FARMPRO_AUTH_SECRET', 'NODE_ENV',
  'RESEND_API_KEY', 'FARMPRO_EMAIL_FROM', 'FARMPRO_BANK_TRANSFER_NOTIFICATION_EMAIL',
  'FARMPRO_BANK_TRANSFER_DUE_DAYS'] as const;
let previous: Record<string, string | undefined>;
let root: string;
let origin: string;
let server: Server;
let users: FarmProUser[];
let emailCalls: unknown[];

type RequestInput = { requestId: string; farmId: string; email: string; revision: string;
  confirmed: boolean; bankApplicationHoldConfirmed: boolean };
function safe(user: FarmProUser): AuthUser {
  const { passwordSalt, passwordHash, ...value } = user;
  return { ...value, plan: value.plan || 'free' };
}
async function put(file: string, data: unknown) {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(data));
}
async function raw(file: string) { return fs.readFile(path.join(root, file), 'utf-8'); }
async function bankData(): Promise<BankTransferApplication[]> { return JSON.parse(await raw('bank-transfer-applications.json')); }
async function snapshot(includeRequests = true): Promise<[string, string][]> {
  const visit = async (directory: string): Promise<string[]> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
      ? visit(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
    return nested.flat();
  };
  return Promise.all((await visit(root)).filter((file) => includeRequests || path.basename(file) !== REQUEST_FILE)
    .sort().map(async (file) => [path.relative(root, file), await fs.readFile(file, 'utf-8')]));
}
async function input(id = 'target'): Promise<RequestInput> {
  const preview = await getOperatorDeletionPreview(id, 'operator');
  return { requestId: crypto.randomUUID(), farmId: preview.user.farmId, email: preview.user.email,
    revision: preview.revision, confirmed: true, bankApplicationHoldConfirmed: true };
}
function cancelInput(value: RequestInput) {
  return { requestId: value.requestId, farmId: value.farmId, email: value.email, confirmed: true };
}
function bankInput(id = 'target', plan: 'standard' | 'pro' = 'standard') {
  const user = users.find((item) => item.id === id)!;
  return { userId: user.id, farmId: user.farmId, farmName: user.farmName, name: user.name, email: user.email,
    plan, amountTaxIncluded: plan === 'standard' ? 33000 : 66000, billing: 'yearly' as const };
}
async function http(url: string, body?: unknown, actor: FarmProUser | null = users[0], method?: string) {
  assert(url.startsWith('/api/'));
  return realFetch(`${origin}${url}`, { method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${createToken(safe(actor))}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function requestUrl(id = 'target') { return `/api/operator/users/${id}/deletion-request`; }
async function accept(value = undefined as RequestInput | undefined, id = 'target') {
  return http(requestUrl(id), value || await input(id));
}
async function assertNotRetired() {
  assert.deepEqual(await readAccountRetirements(), []);
  assert.equal(JSON.parse(await raw('users.json')).length, users.length);
  assert.equal(emailCalls.length, 0);
}

beforeEach(async () => {
  previous = Object.fromEntries(envKeys.map((name) => [name, process.env[name]]));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-request-bank-fixture-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_OPERATOR_EMAILS = 'operator@example.invalid';
  process.env.FARMPRO_AUTH_SECRET = 'fixture-only-auth-key';
  process.env.NODE_ENV = 'test';
  process.env.RESEND_API_KEY = 'fixture-only-email-key';
  process.env.FARMPRO_EMAIL_FROM = 'fixture@example.invalid';
  process.env.FARMPRO_BANK_TRANSFER_NOTIFICATION_EMAIL = 'operator@example.invalid';
  delete process.env.FARMPRO_BANK_TRANSFER_DUE_DAYS;
  const credentials = createPasswordHash('fixture-password');
  users = ['operator', 'target', 'other'].map((id) => ({ id, farmId: `farm-${id}`, farmName: `${id} Fixture Farm`,
    name: 'Fixture Owner', email: `${id}@example.invalid`, role: 'owner', active: true, plan: 'free', ...credentials }));
  await put('users.json', users);
  await put('bank-transfer-applications.json', []);
  await put('stripeSubscriptions.json', []);
  await put('stripeWebhookEvents.json', []);
  await put('farms/farm-target/cattle.json', [{ id: 'fixture-target-cow' }]);
  await put('farms/farm-other/cattle.json', [{ id: 'fixture-other-cow' }]);
  emailCalls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.resend.com/emails', 'Unexpected external request in fixture');
    assert.equal(init?.method, 'POST');
    emailCalls.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: 'fixture-email' }), { headers: { 'Content-Type': 'application/json' } });
  };
  const app = express();
  app.use(express.json());
  app.use('/api/operator/users', requireAuth, operatorUsersRouter);
  app.use('/api/bank-transfer-applications', requireAuth, bankTransferApplicationsRouter);
  app.get('/api/probe', requireAuth, (_req, res) => res.json({ ok: true }));
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
  assert(root.startsWith(path.join(os.tmpdir(), 'farmpro-request-bank-fixture-')));
  await fs.rm(root, { recursive: true, force: true });
  for (const name of envKeys) {
    if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
});

test('status without a request is read-only and never grants deletion', async () => {
  const before = await snapshot();
  const response = await http(requestUrl());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.deepEqual(await response.json(), { request: null, bankApplicationsBlockedByRequest: false,
    stripeAdmissionControlled: false, canDelete: false, deleted: false });
  assert.deepEqual(await snapshot(), before);
});

test('acceptance persists only a bank-admission hold and preserves login tokens and all farm data', async () => {
  const before = await snapshot();
  const value = await input();
  const token = createToken(safe(users[1]));
  const response = await accept(value);
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.deleted, false);
  assert.equal(body.canDelete, false);
  assert.equal(body.bankApplicationsBlockedByRequest, true);
  assert.equal(body.stripeAdmissionControlled, false);
  assert.equal(body.request.status, 'pending_review');
  assert.equal(body.request.requestId, value.requestId);
  assert.equal(body.request.accountRevision, undefined);
  assert.equal(body.request.emailDigest, undefined);
  assert.deepEqual(await snapshot(false), before);
  assert(await verifyToken(token));
  assert(await authenticate(users[1].email, 'fixture-password'));
  assert.equal((await http('/api/probe', undefined, users[1])).status, 200);
  await assertNotRetired();
  const stored = await readAccountDeletionRequests();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].emailDigest, accountEmailDigest(users[1].email));
  assert(!(await raw(REQUEST_FILE)).includes(users[1].email));
  assert(!(await raw(REQUEST_FILE)).includes(users[1].passwordHash));
});

test('parallel duplicate acceptance returns one stable request and one acceptance time', async () => {
  const value = await input();
  const responses = await Promise.all(Array.from({ length: 4 }, () => accept(value)));
  assert.equal(responses.filter((response) => response.status === 202).length, 1);
  assert.equal(responses.filter((response) => response.status === 200).length, 3);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(new Set(bodies.map((body) => body.request.requestedAt)).size, 1);
  assert.equal((await readAccountDeletionRequests()).length, 1);
  await assertNotRetired();
});

test('another request number for the same farm is rejected while unrelated farms remain independent', async () => {
  assert.equal((await accept()).status, 202);
  const before = await snapshot();
  assert.equal((await accept()).status, 409);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await accept(await input('other'), 'other')).status, 202);
  assert.equal((await readAccountDeletionRequests()).length, 2);
});

test('request status acceptance and cancellation all require a currently authorized operator', async () => {
  const value = await input();
  const before = await snapshot();
  for (const actor of [null, users[1]]) {
    const status = actor ? 403 : 401;
    assert.equal((await http(requestUrl(), undefined, actor)).status, status);
    assert.equal((await http(requestUrl(), value, actor)).status, status);
    assert.equal((await http(`${requestUrl()}/cancel`, cancelInput(value), actor)).status, status);
  }
  assert.deepEqual(await snapshot(), before);
  assert.equal(emailCalls.length, 0);
});

test('both confirmations and exact request fields are mandatory without any force override', async () => {
  const value = await input();
  const before = await snapshot();
  for (const change of [{ confirmed: false }, { bankApplicationHoldConfirmed: false }, { bankApplicationHoldConfirmed: undefined },
    { requestId: '' }, { requestId: '../other' }, { revision: 'bad' }, { force: true }, { skipReview: true }, { stripeReview: { state: 'no_match' } }]) {
    assert.equal((await accept({ ...value, ...change } as RequestInput)).status, 400);
    assert.deepEqual(await snapshot(), before);
  }
  for (const invalid of [null, [], 'bad', {}]) assert.equal((await http(requestUrl(), invalid)).status, 400);
  await assertNotRetired();
});

test('wrong identity and a stale preview cannot create a deletion-review request', async () => {
  const value = await input();
  const before = await snapshot();
  for (const change of [{ farmId: 'farm-other' }, { email: 'other@example.invalid' }, { revision: '0'.repeat(64) }]) {
    assert.equal((await accept({ ...value, ...change })).status, 409);
    assert.deepEqual(await snapshot(), before);
  }
  await updateUserProfileById('target', { farmName: 'Updated Fixture', name: 'Updated Owner' });
  assert.equal((await accept(value)).status, 409);
  assert.deepEqual(await readAccountDeletionRequests(), []);
});

test('operators paid accounts shared farms members and the legacy farm cannot be submitted', async () => {
  const self = await input('operator');
  assert.equal((await accept(self, 'operator')).status, 409);
  process.env.FARMPRO_OPERATOR_EMAILS += ',target@example.invalid';
  assert.equal((await accept()).status, 409);
  process.env.FARMPRO_OPERATOR_EMAILS = 'operator@example.invalid';
  for (const change of [{ plan: 'standard' }, { plan: 'pro' }, { farmId: 'farm-other' }, { role: 'member' }, { farmId: 'farm-demo' }]) {
    await put('users.json', [users[0], { ...users[1], ...change }, users[2]]);
    assert.equal((await accept()).status, 409);
    assert.deepEqual(await readAccountDeletionRequests(), []);
  }
});

test('even ended payment history or a pending bank application prevents acceptance', async () => {
  const value = await input();
  for (const file of ['bank-transfer-applications.json', 'stripeSubscriptions.json', 'farms/farm-demo/stripeSubscriptions.json']) {
    for (const status of ['active', 'inactive', 'ended', 'pending_payment']) {
      await put(file, [{ userId: 'target', status }]);
      const before = await snapshot();
      assert.equal((await accept(value)).status, 409);
      assert.deepEqual(await snapshot(), before);
      await put(file, []);
    }
  }
  await assertNotRetired();
});

test('target communication blocks acceptance but other farm communication does not', async () => {
  const value = await input();
  const release = await beginAccountRequest('farm-target');
  try { assert.equal((await accept(value)).status, 409); }
  finally { release(); }
  const releaseOther = await beginAccountRequest('farm-other');
  try { assert.equal((await accept(value)).status, 202); }
  finally { releaseOther(); }
});

test('stored hold survives fresh reads and blocks bank HTTP before any write or email', async () => {
  assert.equal((await accept()).status, 202);
  const persisted = JSON.parse(await raw(REQUEST_FILE));
  await put(REQUEST_FILE, persisted);
  const state = await getOperatorDeletionRequestState('target', 'operator');
  assert.equal(state.bankApplicationsBlockedByRequest, true);
  const before = await snapshot();
  const response = await http('/api/bank-transfer-applications', { plan: 'standard', userId: 'other', farmId: 'farm-other' }, users[1]);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'ACCOUNT_DELETION_BANK_HOLD');
  await assert.rejects(createOrGetPendingBankTransferApplication(bankInput()), /ACCOUNT_DELETION_BANK_HOLD/);
  assert.deepEqual(await snapshot(), before);
  await assertNotRetired();
});

test('another farmer can still apply normally and duplicate bank delivery sends no second email', async () => {
  assert.equal((await accept()).status, 202);
  const targetFarm = await raw('farms/farm-target/cattle.json');
  const first = await http('/api/bank-transfer-applications', { plan: 'standard' }, users[2]);
  assert.equal(first.status, 201);
  const application = (await first.json()).application;
  assert.equal(application.userId, 'other');
  assert.equal(application.billing, 'yearly');
  assert(emailCalls.length > 0);
  const sent = emailCalls.length;
  const second = await http('/api/bank-transfer-applications', { plan: 'standard' }, users[2]);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).alreadyPending, true);
  assert.equal(emailCalls.length, sent);
  assert.equal((await bankData()).length, 1);
  assert.equal(await raw('farms/farm-target/cattle.json'), targetFarm);
  assert.equal((await getOperatorDeletionRequestState('target', 'operator')).bankApplicationsBlockedByRequest, true);
});

test('cancellation releases only its hold without creating an application payment or retirement', async () => {
  const value = await input();
  assert.equal((await accept(value)).status, 202);
  const before = await snapshot(false);
  const response = await http(`${requestUrl()}/cancel`, cancelInput(value));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.request.status, 'cancelled');
  assert.equal(body.bankApplicationsBlockedByRequest, false);
  assert.equal(body.deleted, false);
  assert.equal(body.canDelete, false);
  assert.deepEqual(await snapshot(false), before);
  await assertNotRetired();
  await assertNewBankApplicationAllowed('target', 'farm-target');
  const second = await http(`${requestUrl()}/cancel`, cancelInput(value));
  assert.equal((await second.json()).alreadyCancelled, true);
  const application = await createOrGetPendingBankTransferApplication(bankInput());
  assert.equal(application.created, true);
  assert.equal(application.application.userId, 'target');
});

test('replayed old cancellation never releases a newer request and cannot restart the old request', async () => {
  const first = await input();
  assert.equal((await accept(first)).status, 202);
  assert.equal((await http(`${requestUrl()}/cancel`, cancelInput(first))).status, 200);
  assert.equal((await accept(first)).status, 409);
  const next = await input();
  assert.equal((await accept(next)).status, 202);
  const repeated = await http(`${requestUrl()}/cancel`, cancelInput(first));
  const body = await repeated.json();
  assert.equal(body.alreadyCancelled, true);
  assert.equal(body.bankApplicationsBlockedByRequest, true);
  await assert.rejects(assertNewBankApplicationAllowed('target', 'farm-target'), /ACCOUNT_DELETION_BANK_HOLD/);
  const status = await (await http(requestUrl())).json();
  assert.equal(status.request.requestId, next.requestId);
});

test('cancellation rejects wrong request farm email or confirmation without releasing the hold', async () => {
  const value = await input();
  assert.equal((await accept(value)).status, 202);
  const before = await snapshot();
  for (const change of [{ requestId: crypto.randomUUID() }, { farmId: 'farm-other' }, { email: 'other@example.invalid' },
    { confirmed: false }, { force: true }]) {
    const response = await http(`${requestUrl()}/cancel`, { ...cancelInput(value), ...change });
    assert([400, 404, 409].includes(response.status));
    assert.deepEqual(await snapshot(), before);
  }
  assert.equal((await http(`${requestUrl('other')}/cancel`, { ...cancelInput(value), farmId: 'farm-other', email: users[2].email })).status, 409);
  assert.deepEqual(await snapshot(), before);
});

test('cancellation uses the current verified identity after an email change', async () => {
  const value = await input();
  assert.equal((await accept(value)).status, 202);
  await updateUserEmailById('target', 'changed@example.invalid');
  assert.equal((await http(`${requestUrl()}/cancel`, cancelInput(value))).status, 409);
  const response = await http(`${requestUrl()}/cancel`, { ...cancelInput(value), email: 'changed@example.invalid' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).bankApplicationsBlockedByRequest, false);
});

test('cancellation remains possible after a new card record or an unrelated corrupt billing ledger', async () => {
  const value = await input();
  assert.equal((await accept(value)).status, 202);
  await put('stripeSubscriptions.json', [{ userId: 'target', status: 'active' }]);
  await put('bank-transfer-applications.json', { invalidFixture: true });
  const before = await snapshot(false);
  assert.equal((await http(`${requestUrl()}/cancel`, cancelInput(value))).status, 200);
  assert.deepEqual(await snapshot(false), before);
  await assertNotRetired();
});

test('cancelling a request for a stopped user does not reactivate that user', async () => {
  const value = await input();
  assert.equal((await accept(value)).status, 202);
  await updateUserActiveById('target', false);
  const before = await raw('users.json');
  assert.equal((await http(`${requestUrl()}/cancel`, cancelInput(value))).status, 200);
  assert.equal(await raw('users.json'), before);
  assert.equal(await authenticate(users[1].email, 'fixture-password'), null);
});

test('another currently authorized operator can cancel if the original operator loses access', async () => {
  const value = await input();
  assert.equal((await accept(value)).status, 202);
  process.env.FARMPRO_OPERATOR_EMAILS = users[2].email;
  assert.equal((await http(`${requestUrl()}/cancel`, cancelInput(value))).status, 403);
  assert.equal((await http(`${requestUrl()}/cancel`, cancelInput(value), users[2])).status, 200);
  assert.equal((await readAccountDeletionRequests())[0].cancelledBy, 'other');
});

test('a hold cannot be cancelled or newly accepted after actual retirement has started', async () => {
  const value = await input();
  assert.equal((await accept(value)).status, 202);
  await markAccountRetired({ userId: 'target', farmId: 'farm-target', actorId: 'operator', retiredAt: new Date().toISOString(),
    accountDigest: value.revision, emailDigest: accountEmailDigest(value.email) });
  const before = await snapshot();
  assert.equal((await http(`${requestUrl()}/cancel`, cancelInput(value))).status, 409);
  assert.equal((await accept(value)).status, 409);
  assert.deepEqual(await snapshot(), before);
});

test('request write failure reports unconfirmed and does not silently create a hold', async (t) => {
  const value = await input();
  const before = await snapshot();
  const rename = fs.rename;
  const mocked = t.mock.method(fs, 'rename', async (source: PathLike, destination: PathLike) => {
    if (String(destination) === path.join(root, REQUEST_FILE)) throw new Error('fixture-publication-failure');
    return rename(source, destination);
  });
  assert.equal((await accept(value)).status, 503);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await readAccountDeletionRequests(), []);
  mocked.mock.restore();
  assert.equal((await accept(value)).status, 202);
});

test('an error after request publication is resolved by status and retry without duplicating acceptance', async (t) => {
  const value = await input();
  const rename = fs.rename;
  const mocked = t.mock.method(fs, 'rename', async (source: PathLike, destination: PathLike) => {
    await rename(source, destination);
    if (String(destination) === path.join(root, REQUEST_FILE)) throw new Error('fixture-after-publication');
  });
  assert.equal((await accept(value)).status, 503);
  mocked.mock.restore();
  const status = await (await http(requestUrl())).json();
  assert.equal(status.bankApplicationsBlockedByRequest, true);
  assert.equal((await accept(value)).status, 200);
  assert.equal((await readAccountDeletionRequests()).length, 1);
});

test('a failed cancellation publication leaves the hold intact and can be retried', async (t) => {
  const value = await input();
  assert.equal((await accept(value)).status, 202);
  const before = await snapshot();
  const rename = fs.rename;
  const mocked = t.mock.method(fs, 'rename', async (source: PathLike, destination: PathLike) => {
    if (String(destination) === path.join(root, REQUEST_FILE)) throw new Error('fixture-cancel-failure');
    return rename(source, destination);
  });
  assert.equal((await http(`${requestUrl()}/cancel`, cancelInput(value))).status, 503);
  assert.deepEqual(await snapshot(), before);
  await assert.rejects(assertNewBankApplicationAllowed('target', 'farm-target'), /ACCOUNT_DELETION_BANK_HOLD/);
  mocked.mock.restore();
  assert.equal((await http(`${requestUrl()}/cancel`, cancelInput(value))).status, 200);
});

test('corrupt request metadata fails closed without replacing it or sending bank email', async () => {
  const value = await input();
  for (const invalid of [{}, { version: 2, records: [] }, { version: 1, records: [null] }, { version: 1, records: [{}] }]) {
    await put(REQUEST_FILE, invalid);
    const before = await snapshot();
    assert.equal((await http(requestUrl())).status, 503);
    assert.equal((await accept(value)).status, 503);
    const response = await http('/api/bank-transfer-applications', { plan: 'standard' }, users[1]);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'BANK_APPLICATION_STATE_UNAVAILABLE');
    assert.deepEqual(await snapshot(), before);
    assert.equal(emailCalls.length, 0);
  }
});

test('duplicate malformed oversized or symbolic-link hold files are rejected', async () => {
  const value = await input();
  assert.equal((await accept(value)).status, 202);
  const records = await readAccountDeletionRequests();
  for (const altered of [[records[0], records[0]], [{ ...records[0], requestedAt: 'bad' }],
    [{ ...records[0], status: 'cancelled' }], [{ ...records[0], cancelledAt: new Date().toISOString() }]]) {
    await put(REQUEST_FILE, { version: 1, records: altered });
    await assert.rejects(readAccountDeletionRequests(), /ACCOUNT_DELETION_REQUESTS_INVALID/);
  }
  await fs.writeFile(path.join(root, REQUEST_FILE), 'x'.repeat(4 * 1024 * 1024 + 1));
  await assert.rejects(readAccountDeletionRequests(), /ACCOUNT_DELETION_REQUESTS_INVALID/);
  await fs.unlink(path.join(root, REQUEST_FILE));
  await put('fixture-hold-target.json', { version: 1, records });
  await fs.symlink(path.join(root, 'fixture-hold-target.json'), path.join(root, REQUEST_FILE));
  await assert.rejects(readAccountDeletionRequests(), /ACCOUNT_DELETION_REQUESTS_INVALID/);
});

test('request-first concurrency blocks the bank application without changing billing', async () => {
  const value = await input();
  const results = await Promise.allSettled([
    requestOperatorAccountDeletion('target', 'operator', value),
    createOrGetPendingBankTransferApplication(bankInput()),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  if (results[1].status === 'rejected') assert.match(String(results[1].reason), /ACCOUNT_DELETION_BANK_HOLD/);
  assert.deepEqual(await bankData(), []);
  assert.equal((await readAccountDeletionRequests()).length, 1);
});

test('bank-first concurrency prevents request acceptance once an application is recorded', async () => {
  const value = await input();
  const results = await Promise.allSettled([
    createOrGetPendingBankTransferApplication(bankInput()),
    requestOperatorAccountDeletion('target', 'operator', value),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  if (results[1].status === 'rejected') assert.match(String(results[1].reason), /ACCOUNT_DELETE_BLOCKED/);
  assert.equal((await bankData()).length, 1);
  assert.deepEqual(await readAccountDeletionRequests(), []);
});

test('cancellation-before-bank admits the new application while bank-before-cancellation remains blocked', async () => {
  const value = await input();
  assert.equal((await accept(value)).status, 202);
  const first = await Promise.allSettled([
    createOrGetPendingBankTransferApplication(bankInput()),
    cancelOperatorAccountDeletionRequest('target', 'operator', cancelInput(value)),
  ]);
  assert.equal(first[0].status, 'rejected');
  assert.equal(first[1].status, 'fulfilled');
  const next = await input();
  assert.equal((await accept(next)).status, 202);
  const second = await Promise.allSettled([
    cancelOperatorAccountDeletionRequest('target', 'operator', cancelInput(next)),
    createOrGetPendingBankTransferApplication(bankInput()),
  ]);
  assert.equal(second[0].status, 'fulfilled');
  assert.equal(second[1].status, 'fulfilled');
  assert.equal((await bankData()).length, 1);
});

test('parallel bank creation retains unrelated applications and deduplicates the same plan', async () => {
  const results = await Promise.all([
    ...Array.from({ length: 5 }, () => createOrGetPendingBankTransferApplication(bankInput())),
    createOrGetPendingBankTransferApplication(bankInput('other', 'pro')),
  ]);
  assert.equal(results.filter((result) => result.created).length, 2);
  assert.equal(new Set(results.slice(0, 5).map((result) => result.application.id)).size, 1);
  const stored = await bankData();
  assert.deepEqual(stored.map((item) => item.userId).sort(), ['other', 'target']);
});

test('expiry activation and application creation do not overwrite one another in the bank ledger', async () => {
  process.env.FARMPRO_BANK_TRANSFER_DUE_DAYS = '7';
  const future = new Date(Date.now() + 86400000).toISOString();
  const old = '2000-01-01T00:00:00.000Z';
  const pending = { ...bankInput('other'), id: 'fixture-to-activate', status: 'pending_payment' as const, createdAt: new Date().toISOString() };
  const ended = { ...bankInput('operator'), id: 'fixture-ended', status: 'active' as const, createdAt: old, contractEndsAt: old };
  const overdue = { ...bankInput('operator'), id: 'fixture-overdue', status: 'pending_payment' as const, createdAt: old };
  const unchanged = { ...bankInput('operator'), id: 'fixture-valid', status: 'active' as const, createdAt: old, contractEndsAt: future };
  await put('bank-transfer-applications.json', [pending, ended, overdue, unchanged]);
  await Promise.all([
    expireEndedBankTransferContracts(),
    activateBankTransferApplication(pending.id, users[0].email),
    createOrGetPendingBankTransferApplication(bankInput()),
    expireOverdueBankTransferApplications(),
    listBankTransferApplications(),
  ]);
  const stored = await bankData();
  assert.equal(stored.length, 5);
  assert.equal(stored.find((item) => item.id === pending.id)?.status, 'active');
  assert(stored.find((item) => item.id === pending.id)?.contractEndsAt);
  assert.equal(stored.find((item) => item.id === ended.id)?.status, 'expired');
  assert.equal(stored.find((item) => item.id === overdue.id)?.status, 'expired');
  assert.deepEqual(stored.find((item) => item.id === unchanged.id), unchanged);
  assert.equal(stored.find((item) => item.userId === 'target')?.status, 'pending_payment');
});

test('no alternate request HTTP method performs a write and unknown targets are not accepted', async () => {
  const value = await input();
  const before = await snapshot();
  for (const method of ['PUT', 'PATCH', 'DELETE']) assert.equal((await http(requestUrl(), value, users[0], method)).status, 404);
  assert.equal((await http(requestUrl('missing'), value)).status, 404);
  assert.equal((await http(requestUrl('bad%20id'), value)).status, 400);
  assert.deepEqual(await snapshot(), before);
  await assertNotRetired();
});
