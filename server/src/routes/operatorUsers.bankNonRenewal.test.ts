import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { createToken, type AuthUser, type FarmProUser } from '../authStore';
import { requireAuth } from '../authMiddleware';
import { expireEndedBankTransferContracts, type BankTransferApplication } from '../bankTransferApplicationStore';
import { getBankNonRenewalSummary, validContractEnd } from '../bankTransferNonRenewalStore';
import { operatorUsersRouter } from './operatorUsers';
import { getActiveSubscriptionSummary } from '../stripeWebhook';

let root: string;
let server: Server;
let origin: string;
let users: FarmProUser[];
let contracts: BankTransferApplication[];
let end: string;
const previous = {
  data: process.env.FARMPRO_DATA_DIR,
  operators: process.env.FARMPRO_OPERATOR_EMAILS,
  secret: process.env.FARMPRO_AUTH_SECRET,
};
const protectedPaths = ['users.json', 'bank-transfer-applications.json', 'stripeSubscriptions.json', 'stripeWebhookEvents.json', 'farms/farm-target/cattle.json', 'farms/farm-other/cattle.json'];

test('local webhook fixtures permit an explicit unpaid reset while real card and bank contracts still block it', async () => {
  await write('bank-transfer-applications.json', []);
  const fixture = { subscriptionId: 'sub_farmpro_test_123456', userId: 'target', status: 'active', plan: 'standard', billing: 'monthly', updatedAt: '2026-01-01T00:00:00Z' };
  await write('stripeSubscriptions.json', [fixture]);
  await write('farms/farm-demo/stripeSubscriptions.json', [fixture]);
  const before = await fs.readFile(path.join(root, 'stripeSubscriptions.json'), 'utf8');
  assert.equal(await getActiveSubscriptionSummary('target'), null);
  for (const subscriptionId of ['sub_realContract', 'sub_farmpro_test_invalid']) {
    await write('stripeSubscriptions.json', [fixture, { ...fixture, subscriptionId }]);
    assert.equal((await post('reset-unpaid-to-free', {})).status, 409);
  }
  await write('stripeSubscriptions.json', [fixture]);
  await write('bank-transfer-applications.json', contracts);
  assert.equal((await post('reset-unpaid-to-free', {})).status, 409);
  await write('bank-transfer-applications.json', []);
  const response = await post('reset-unpaid-to-free', {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.plan, 'free');
  // Existing legacy merging normalizes JSON whitespace; record content is retained.
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'stripeSubscriptions.json'), 'utf8')), JSON.parse(before));
  assert.equal(await fs.readFile(path.join(root, 'farms/farm-demo/stripeSubscriptions.json'), 'utf8'), before);
  const stored = JSON.parse(await fs.readFile(path.join(root, 'users.json'), 'utf8'));
  assert.equal(stored.find((u: FarmProUser) => u.id === 'other').plan, 'pro');
});

function account(id: string, farmId: string, plan: 'free' | 'standard' | 'pro', email = `${id}@example.invalid`): FarmProUser {
  return { id, farmId, farmName: 'Fixture Farm', name: 'Test User', email, role: 'owner', active: true, plan, passwordSalt: 'fixture-only', passwordHash: 'fixture-only' };
}
function safe(user: FarmProUser): AuthUser {
  const { passwordSalt, passwordHash, ...rest } = user;
  return { ...rest, plan: rest.plan || 'free' };
}
async function write(file: string, data: unknown) {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(data));
}
async function snapshot() {
  return Promise.all(protectedPaths.map((file) => fs.readFile(path.join(root, file), 'utf-8')));
}
async function post(suffix = 'bank-non-renewal', body: unknown = { applicationId: 'contract-one', contractEndsAt: end, confirmed: true }, who: FarmProUser | null = users[0], target = 'target') {
  return fetch(`${origin}/api/operator/users/${target}/${suffix}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${createToken(safe(who))}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-bank-nonrenewal-test-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_OPERATOR_EMAILS = 'operator@example.invalid';
  process.env.FARMPRO_AUTH_SECRET = 'isolated-test-secret-not-for-production';
  end = new Date(Date.now() + 90 * 86400000).toISOString();
  users = [account('operator', 'farm-operator', 'free'), account('target', 'farm-target', 'standard'), account('other', 'farm-other', 'pro')];
  contracts = [{
    id: 'contract-one', userId: 'target', farmId: 'farm-target', farmName: 'Fixture Farm', name: 'Test User', email: 'target@example.invalid',
    plan: 'standard', amountTaxIncluded: 33000, billing: 'yearly', status: 'active',
    createdAt: new Date(Date.now() - 86400000).toISOString(), activatedAt: new Date(Date.now() - 86400000).toISOString(), contractEndsAt: end,
  }];
  await write('users.json', users);
  await write('bank-transfer-applications.json', contracts);
  await write('stripeSubscriptions.json', []);
  await write('stripeWebhookEvents.json', []);
  await write('farms/farm-target/cattle.json', [{ id: 'keep-target-cow' }]);
  await write('farms/farm-other/cattle.json', [{ id: 'keep-other-cow' }]);
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
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await fs.rm(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries({ FARMPRO_DATA_DIR: previous.data, FARMPRO_OPERATOR_EMAILS: previous.operators, FARMPRO_AUTH_SECRET: previous.secret })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('receipt preserves paid plan, active state, exact end, all ledgers and both farms', async () => {
  const before = await snapshot();
  const response = await post();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.plan, 'standard');
  assert.equal(body.user.active, true);
  assert.equal(body.user.paymentSource, 'bank');
  assert.equal(body.user.bankNonRenewal.contractEndsAt, end);
  assert.equal(body.user.bankNonRenewal.canRequest, false);
  assert(body.user.bankNonRenewal.requestedAt);
  assert.deepEqual(await snapshot(), before);
  const [file] = await fs.readdir(path.join(root, 'bank-non-renewal'));
  const receipt = JSON.parse(await fs.readFile(path.join(root, 'bank-non-renewal', file), 'utf-8'));
  assert.equal(receipt.requestedByUserId, 'operator');
  assert.equal(receipt.userId, 'target');
  assert.equal(receipt.email, undefined);
  assert.equal(receipt.passwordHash, undefined);
  assert.equal(receipt.farmName, undefined);
});

test('duplicate concurrent submissions create one receipt and return the same acceptance time', async () => {
  const before = await snapshot();
  const responses = await Promise.all(Array.from({ length: 6 }, () => post()));
  assert(responses.every((item) => item.status === 200));
  const bodies = await Promise.all(responses.map((item) => item.json()));
  assert.equal(bodies.filter((item) => !item.alreadyRequested).length, 1);
  assert.equal(new Set(bodies.map((item) => item.user.bankNonRenewal.requestedAt)).size, 1);
  assert.equal((await fs.readdir(path.join(root, 'bank-non-renewal'))).length, 1);
  assert.deepEqual(await snapshot(), before);
});

test('reloading the operator list keeps the acceptance without downgrading', async () => {
  await post();
  const response = await fetch(`${origin}/api/operator/users`, { headers: { Authorization: `Bearer ${createToken(safe(users[0]))}` } });
  assert.equal(response.status, 200);
  const target = (await response.json()).users.find((item: AuthUser) => item.id === 'target');
  assert.equal(target.plan, 'standard');
  assert.equal(target.bankNonRenewal.contractEndsAt, end);
  assert(target.bankNonRenewal.requestedAt);
  assert.equal(target.bankNonRenewal.canRequest, false);
});

test('cached legacy immediate-end endpoint is disabled and changes nothing', async () => {
  const before = await snapshot();
  assert.equal((await post('end-bank-transfer', {})).status, 409);
  assert.deepEqual(await snapshot(), before);
});

test('unauthenticated and non-operator callers cannot submit', async () => {
  const before = await snapshot();
  assert.equal((await post('bank-non-renewal', {}, null)).status, 401);
  assert.equal((await post('bank-non-renewal', {}, users[1])).status, 403);
  assert.deepEqual(await snapshot(), before);
});

test('explicit confirmation and the exact displayed contract are required', async () => {
  const before = await snapshot();
  assert.equal((await post('bank-non-renewal', { applicationId: 'contract-one', contractEndsAt: end, confirmed: false })).status, 400);
  assert.equal((await post('bank-non-renewal', { applicationId: 'wrong-contract', contractEndsAt: end, confirmed: true })).status, 409);
  assert.equal((await post('bank-non-renewal', { applicationId: 'contract-one', contractEndsAt: '2099-01-01T00:00:00.000Z', confirmed: true })).status, 409);
  assert.deepEqual(await snapshot(), before);
});

test('missing, invalid and elapsed end dates fail closed without inferring a deadline', async () => {
  for (const value of [undefined, 'invalid', '2099-02-30T00:00:00.000Z', '2020-01-01T00:00:00.000Z']) {
    contracts[0].contractEndsAt = value;
    await write('bank-transfer-applications.json', contracts);
    const before = await snapshot();
    assert.equal((await post()).status, 409);
    const summary = await getBankNonRenewalSummary(safe(users[1]));
    assert.equal(summary?.canRequest, false);
    assert(summary?.reason);
    assert.deepEqual(await snapshot(), before);
  }
});

test('multiple active contracts or pending next-year applications require review', async () => {
  for (const status of ['active', 'pending_payment'] as const) {
    await write('bank-transfer-applications.json', [...contracts, { ...contracts[0], id: 'next-contract', status }]);
    const before = await snapshot();
    assert.equal((await post()).status, 409);
    assert.deepEqual(await snapshot(), before);
  }
});

test('Stripe plus bank cannot be acknowledged as a bank-only termination', async () => {
  await write('stripeSubscriptions.json', [{ subscriptionId: 'sub-fixture', userId: 'target', plan: 'standard', billing: 'monthly', status: 'active', updatedAt: new Date().toISOString() }]);
  const before = await snapshot();
  assert.equal((await post()).status, 409);
  assert.deepEqual(await snapshot(), before);
});

test('another user pending application does not block or get changed', async () => {
  await write('bank-transfer-applications.json', [...contracts, { ...contracts[0], id: 'other-contract', userId: 'other', farmId: 'farm-other', status: 'pending_payment' }]);
  const before = await snapshot();
  assert.equal((await post()).status, 200);
  assert.deepEqual(await snapshot(), before);
});

test('account/farm/plan mismatches cannot be submitted', async () => {
  for (const changes of [{ farmId: 'farm-other' }, { plan: 'pro' }, { billing: 'monthly' }]) {
    await write('bank-transfer-applications.json', [{ ...contracts[0], ...changes }]);
    const before = await snapshot();
    assert.equal((await post()).status, 409);
    assert.deepEqual(await snapshot(), before);
  }
});

test('unknown user and accounts without an active bank contract are rejected', async () => {
  assert.equal((await post('bank-non-renewal', { applicationId: 'contract-one', contractEndsAt: end, confirmed: true }, users[0], 'missing')).status, 404);
  await write('bank-transfer-applications.json', []);
  assert.equal((await post()).status, 409);
  assert.equal(await getBankNonRenewalSummary(safe(users[1])), null);
});

test('exact period boundary remains unchanged by the receipt', async () => {
  await post();
  const account = safe(users[1]);
  assert.equal((await getBankNonRenewalSummary(account, contracts, Date.parse(end) - 1))?.reason, '');
  assert((await getBankNonRenewalSummary(account, contracts, Date.parse(end)))?.reason);
  assert((await getBankNonRenewalSummary(account, contracts, Date.parse(end) + 1))?.reason);
  const before = await snapshot();
  assert.equal((await expireEndedBankTransferContracts(new Date(Date.parse(end) - 1))).changed, false);
  assert.deepEqual(await snapshot(), before);
  const expired = await expireEndedBankTransferContracts(new Date(end));
  assert.equal(expired.changed, true);
  assert.deepEqual(expired.expiredUserIds, ['target']);
});

test('changed end date after acceptance requires review rather than reusing the old receipt', async () => {
  await post();
  contracts[0].contractEndsAt = new Date(Date.parse(end) + 86400000).toISOString();
  await write('bank-transfer-applications.json', contracts);
  const summary = await getBankNonRenewalSummary(safe(users[1]));
  assert.equal(summary?.requestedAt, null);
  assert.equal(summary?.canRequest, false);
  assert(summary?.reason);
  const before = await snapshot();
  assert.equal((await post()).status, 409);
  assert.deepEqual(await snapshot(), before);
});

test('storage failure does not report success or change payment/farm data', async () => {
  await fs.writeFile(path.join(root, 'bank-non-renewal'), 'blocked-fixture');
  const before = await snapshot();
  assert.equal((await post()).status, 500);
  assert.deepEqual(await snapshot(), before);
});

test('corrupt receipt fails closed and is not replaced', async () => {
  await post();
  const [file] = await fs.readdir(path.join(root, 'bank-non-renewal'));
  const receipt = path.join(root, 'bank-non-renewal', file);
  await fs.writeFile(receipt, '{}');
  const before = await snapshot();
  assert.equal((await post()).status, 500);
  assert.equal(await fs.readFile(receipt, 'utf-8'), '{}');
  assert.deepEqual(await snapshot(), before);
});

test('receipt does not enable the existing unpaid-to-Free operation while bank payment is active', async () => {
  await post();
  const before = await snapshot();
  assert.equal((await post('reset-unpaid-to-free', {})).status, 409);
  assert.deepEqual(await snapshot(), before);
});

test('date validation accepts real recorded UTC/Japan timestamps and rejects ambiguous dates', () => {
  assert(validContractEnd('2027-01-01T00:00:00.000Z'));
  assert(validContractEnd('2027-01-01T09:00:00+09:00'));
  for (const value of ['2027-01-01', '2027-01-01T00:00:00', '2027-02-29T00:00:00.000Z', '2027-01-01T24:00:00.000Z', null]) assert.equal(validContractEnd(value), false);
});

test('review reasons identify each failed field while all existing rejection guards remain active', async () => {
  const cases: { change: Record<string, unknown>; reason: string }[] = [
    { change: { id: '' }, reason: '銀行振込契約を識別する情報が未登録です。' },
    { change: { farmId: undefined }, reason: '銀行振込契約の農場情報が未登録です。' },
    { change: { farmId: 'farm-other' }, reason: '利用者の農場と銀行振込契約の農場が一致しません。' },
    { change: { plan: 'pro' }, reason: '利用者のプランと銀行振込契約のプランが一致しません。' },
    { change: { billing: undefined }, reason: '銀行振込契約の支払周期が未登録です。' },
    { change: { billing: 'monthly' }, reason: '銀行振込契約が年払いの記録になっていません。' },
    { change: { contractEndsAt: undefined }, reason: '契約終了日時が未登録です。支払済み期間を確認してください。' },
    { change: { contractEndsAt: 'invalid' }, reason: '契約終了日時の形式を確認できません。記録を確認してください。' },
    { change: { contractEndsAt: '2020-01-01T00:00:00.000Z' }, reason: '契約終了日時を過ぎています。最新の契約状態を確認してください。' },
  ];
  for (const { change, reason } of cases) {
    await write('bank-transfer-applications.json', [{ ...contracts[0], ...change }]);
    const before = await snapshot();
    const summary = await getBankNonRenewalSummary(safe(users[1]));
    assert.equal(summary?.reason, reason);
    assert.equal(summary?.canRequest, false);
    assert.equal(summary?.requestedAt, null);
    assert.equal((await post()).status, 409);
    assert.deepEqual(await snapshot(), before);
  }
});

test('legacy contract reports all missing fields together without inventing values or an end date', async () => {
  const { id, farmId, billing, contractEndsAt, ...legacy } = contracts[0];
  await write('bank-transfer-applications.json', [legacy]);
  const before = await snapshot();
  const summary = await getBankNonRenewalSummary(safe(users[1]));
  assert.deepEqual(summary?.reason.split('\n'), [
    '銀行振込契約を識別する情報が未登録です。',
    '銀行振込契約の農場情報が未登録です。',
    '銀行振込契約の支払周期が未登録です。',
    '契約終了日時が未登録です。支払済み期間を確認してください。',
  ]);
  assert.equal(summary?.contractEndsAt, null);
  assert.equal(summary?.canRequest, false);
  assert.equal((await post()).status, 409);
  assert.deepEqual(await snapshot(), before);
});

test('operator list exposes missing contract fields while keeping the account Standard and active', async () => {
  const { farmId, billing, contractEndsAt, ...legacy } = contracts[0];
  await write('bank-transfer-applications.json', [legacy]);
  const before = await snapshot();
  const response = await fetch(`${origin}/api/operator/users`, { headers: { Authorization: `Bearer ${createToken(safe(users[0]))}` } });
  assert.equal(response.status, 200);
  const target = (await response.json()).users.find((item: AuthUser) => item.id === 'target');
  assert.equal(target.plan, 'standard');
  assert.equal(target.active, true);
  assert.equal(target.paymentSource, 'bank');
  assert.equal(target.bankNonRenewal.contractEndsAt, null);
  assert.equal(target.bankNonRenewal.canRequest, false);
  assert.match(target.bankNonRenewal.reason, /農場情報が未登録/);
  assert.match(target.bankNonRenewal.reason, /支払周期が未登録/);
  assert.match(target.bankNonRenewal.reason, /契約終了日時が未登録/);
  assert.deepEqual(await snapshot(), before);
});

test('changes to display names and email do not get mistaken for an identity or period mismatch', async () => {
  await write('bank-transfer-applications.json', [{ ...contracts[0], farmName: 'Old Farm Name', name: 'Old Display Name', email: 'old@example.invalid' }]);
  const before = await snapshot();
  const summary = await getBankNonRenewalSummary(safe(users[1]));
  assert.equal(summary?.reason, '');
  assert.equal(summary?.canRequest, true);
  assert.equal(summary?.contractEndsAt, end);
  assert.equal((await post()).status, 200);
  assert.deepEqual(await snapshot(), before);
});
