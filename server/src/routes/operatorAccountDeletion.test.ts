import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { authenticate, createPasswordHash, createToken, createUser, listUsersForOperator, resetPassword, updateUserProfileById, verifyToken, type AuthUser, type FarmProUser } from '../authStore';
import { requireAuth } from '../authMiddleware';
import { operatorUsersRouter } from './operatorUsers';
import { authRouter } from './auth';
import { passwordResetRouter } from './passwordReset';
import { deleteOperatorFreeAccount, getOperatorDeletionPreview, type AccountDeletionConfirmation } from '../operatorAccountDeletionStore';
import { readAccountRetirements } from '../accountDeletionGuard';
import { beginAccountRequest } from '../accountRequestLease';
import { readJson, writeJson } from '../jsonStore';
import { runWithFarm } from '../farmContext';
import { createPendingPasswordReset, verifyPendingPasswordReset } from '../passwordResetVerificationStore';

let root: string;
let server: Server;
let origin: string;
let users: FarmProUser[];
const original = { FARMPRO_DATA_DIR: process.env.FARMPRO_DATA_DIR, FARMPRO_OPERATOR_EMAILS: process.env.FARMPRO_OPERATOR_EMAILS,
  FARMPRO_AUTH_SECRET: process.env.FARMPRO_AUTH_SECRET, NODE_ENV: process.env.NODE_ENV };
const files = ['users.json', 'bank-transfer-applications.json', 'stripeSubscriptions.json', 'stripeWebhookEvents.json',
  'farms/farm-target/cattle.json', 'farms/farm-other/cattle.json'];
function safe(user: FarmProUser): AuthUser {
  const { passwordSalt, passwordHash, ...value } = user;
  return { ...value, plan: value.plan || 'free' };
}
async function put(file: string, value: unknown) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), JSON.stringify(value));
}
async function raw(file: string) { return fs.readFile(path.join(root, file), 'utf-8'); }
async function snapshot() { return Promise.all(files.map(raw)); }
async function confirmation(id = 'target'): Promise<AccountDeletionConfirmation> {
  const value = await getOperatorDeletionPreview(id, 'operator');
  return { farmId: value.user.farmId, email: value.user.email, revision: value.revision, confirmed: true };
}
async function request(suffix: string, body?: unknown, user: FarmProUser | null = users[0]) {
  return fetch(`${origin}${suffix}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${createToken(safe(user))}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-account-delete-fixture-'));
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_OPERATOR_EMAILS = 'operator@example.invalid';
  process.env.FARMPRO_AUTH_SECRET = 'fixture-only-secret-not-a-production-key';
  process.env.NODE_ENV = 'test';
  const credentials = createPasswordHash('fixture-password');
  users = ['operator', 'target', 'other'].map((id) => ({ id, farmId: `farm-${id}`, farmName: `${id} Fixture Farm`, name: 'Fixture Owner',
    email: `${id}@example.invalid`, role: 'owner', active: true, plan: 'free', ...credentials }));
  await put('users.json', users);
  await put('bank-transfer-applications.json', []);
  await put('stripeSubscriptions.json', []);
  await put('stripeWebhookEvents.json', []);
  await put('farms/farm-target/cattle.json', [{ id: 'target-cow' }]);
  await put('farms/farm-target/photos.json', [{ id: 'target-photo' }]);
  await put('farms/farm-other/cattle.json', [{ id: 'other-cow' }]);
  const app = express();
  app.use(express.json());
  app.use('/api/auth/password-reset', passwordResetRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/operator/users', requireAuth, operatorUsersRouter);
  app.get('/api/probe', requireAuth, (_req, res) => res.json({ ok: true }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  // Only a mkdtemp-created fixture directory is ever removed by this test hook.
  if (root) await fs.rm(root, { recursive: true, force: true });
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('preview is read-only, identifies the exact target and never returns credentials', async () => {
  const before = await snapshot();
  const response = await request('/api/operator/users/target/deletion-preview');
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.canDelete, true);
  assert.equal(value.user.id, 'target');
  assert.equal(value.user.passwordSalt, undefined);
  assert.equal(value.user.passwordHash, undefined);
  assert.match(value.revision, /^[a-f0-9]{64}$/);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await readAccountRetirements(), []);
});

test('confirmed deletion removes only the target account and farm and revokes login and existing tokens', async () => {
  const other = await raw('farms/farm-other/cattle.json');
  const billing = await Promise.all(files.slice(1, 4).map(raw));
  const token = createToken(safe(users[1]));
  const response = await request('/api/operator/users/target/delete', await confirmation());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deleted, true);
  assert.deepEqual(JSON.parse(await raw('users.json')), [users[0], users[2]]);
  await assert.rejects(fs.stat(path.join(root, 'farms/farm-target')), { code: 'ENOENT' });
  assert.equal(await raw('farms/farm-other/cattle.json'), other);
  assert.deepEqual(await Promise.all(files.slice(1, 4).map(raw)), billing);
  assert.equal(await verifyToken(token), null);
  assert.equal(await authenticate(users[1].email, 'fixture-password'), null);
  assert(await authenticate(users[0].email, 'fixture-password'));
  assert.equal((await request('/api/probe', undefined, users[1])).status, 401);
  assert.equal((await listUsersForOperator()).length, 2);
  const marker = (await readAccountRetirements())[0];
  assert.equal(marker.userId, 'target');
  assert.equal(marker.actorId, 'operator');
  assert(!JSON.stringify(marker).includes(users[1].email));
  assert(!JSON.stringify(marker).includes(users[1].passwordHash));
});

test('confirmation checkbox, email, farm and revision are all mandatory and rechecked', async () => {
  const expected = await confirmation();
  const before = await snapshot();
  for (const change of [{ confirmed: false }, { email: 'wrong@example.invalid' }, { farmId: 'farm-other' }, { revision: '0'.repeat(64) }]) {
    const response = await request('/api/operator/users/target/delete', { ...expected, ...change });
    assert([400, 409].includes(response.status));
    assert.deepEqual(await snapshot(), before);
  }
  assert.deepEqual(await readAccountRetirements(), []);
});

test('unauthenticated and non-operator requests cannot preview or delete', async () => {
  const expected = await confirmation();
  const before = await snapshot();
  for (const user of [null, users[1]]) {
    assert([401, 403].includes((await request('/api/operator/users/target/deletion-preview', undefined, user)).status));
    assert([401, 403].includes((await request('/api/operator/users/target/delete', expected, user)).status));
  }
  assert.deepEqual(await snapshot(), before);
});

test('current operator and other configured operators are protected', async () => {
  process.env.FARMPRO_OPERATOR_EMAILS += ',target@example.invalid';
  const before = await snapshot();
  for (const id of ['operator', 'target']) {
    const preview = await getOperatorDeletionPreview(id, 'operator');
    assert.equal(preview.canDelete, false);
    await assert.rejects(deleteOperatorFreeAccount(id, 'operator', await confirmation(id)), /ACCOUNT_DELETE_BLOCKED/);
  }
  assert.deepEqual(await snapshot(), before);
});

test('paid plans, shared farms, members and the legacy common farm are protected', async () => {
  for (const change of [{ plan: 'standard' }, { plan: 'pro' }, { farmId: 'farm-other' }, { role: 'member' }, { farmId: 'farm-demo' }]) {
    await put('users.json', [users[0], { ...users[1], ...change }, users[2]]);
    const before = await snapshot();
    const preview = await getOperatorDeletionPreview('target', 'operator');
    assert.equal(preview.canDelete, false);
    await assert.rejects(deleteOperatorFreeAccount('target', 'operator', await confirmation()), /ACCOUNT_DELETE_BLOCKED/);
    assert.deepEqual(await snapshot(), before);
  }
});

test('Free with any bank or Stripe history, including legacy records, is not erased', async () => {
  for (const file of ['bank-transfer-applications.json', 'stripeSubscriptions.json', 'farms/farm-demo/stripeSubscriptions.json']) {
    for (const status of ['active', 'pending_payment', 'inactive', 'ended']) {
      await put(file, [{ userId: 'target', status, billing: 'monthly' }]);
      const before = await snapshot();
      assert.equal((await getOperatorDeletionPreview('target', 'operator')).canDelete, false);
      await assert.rejects(deleteOperatorFreeAccount('target', 'operator', await confirmation()), /ACCOUNT_DELETE_BLOCKED/);
      assert.deepEqual(await snapshot(), before);
      await put(file, []);
    }
  }
});

test('other account payment records remain intact and do not block the unrelated Free target', async () => {
  await put('bank-transfer-applications.json', [{ userId: 'other', farmId: 'farm-other', status: 'active' }]);
  const ledger = await raw('bank-transfer-applications.json');
  await deleteOperatorFreeAccount('target', 'operator', await confirmation());
  assert.equal(await raw('bank-transfer-applications.json'), ledger);
});

test('unknown or malformed billing data fails closed without starting deletion', async () => {
  for (const data of [{}, [null], [{ status: 'active' }]]) {
    await put('stripeSubscriptions.json', data);
    const before = await snapshot();
    const response = await request('/api/operator/users/target/deletion-preview');
    assert.equal(response.status, 503);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await readAccountRetirements(), []);
  }
});

test('a stale preview cannot delete a renamed account or one that acquired payment history', async () => {
  const expected = await confirmation();
  await updateUserProfileById('target', { farmName: 'Updated Fixture Farm', name: 'Fixture Owner' });
  const before = await snapshot();
  await assert.rejects(deleteOperatorFreeAccount('target', 'operator', expected), /ACCOUNT_CHANGED/);
  assert.deepEqual(await snapshot(), before);
  const next = await confirmation();
  await put('stripeSubscriptions.json', [{ userId: 'target', status: 'active' }]);
  await assert.rejects(deleteOperatorFreeAccount('target', 'operator', next), /ACCOUNT_DELETE_BLOCKED/);
  assert.deepEqual(await readAccountRetirements(), []);
});

test('in-flight requests block deletion, then deletion is allowed after they finish', async () => {
  const expected = await confirmation();
  const release = await beginAccountRequest('farm-target');
  try {
    await assert.rejects(deleteOperatorFreeAccount('target', 'operator', expected), /ACCOUNT_BUSY/);
    assert.deepEqual(await readAccountRetirements(), []);
  } finally { release(); release(); }
  assert.equal((await deleteOperatorFreeAccount('target', 'operator', expected)).deleted, true);
});

test('duplicate concurrent deletions return success for only the same confirmed identity', async () => {
  const expected = await confirmation();
  const results = await Promise.all(Array.from({ length: 4 }, () => deleteOperatorFreeAccount('target', 'operator', expected)));
  assert.equal(results.filter((item) => !item.alreadyDeleted).length, 1);
  assert.equal((await readAccountRetirements()).length, 1);
  await assert.rejects(deleteOperatorFreeAccount('target', 'operator', { ...expected, email: users[2].email }), /USER_NOT_FOUND/);
});

test('late account, billing and farm writes cannot recreate a deleted account', async () => {
  const staleUsers = JSON.parse(await raw('users.json'));
  await deleteOperatorFreeAccount('target', 'operator', await confirmation());
  await assert.rejects(writeJson('users.json', staleUsers), /ACCOUNT_RETIRED/);
  await assert.rejects(writeJson('stripeSubscriptions.json', [{ userId: 'target', status: 'active' }]), /ACCOUNT_RETIRED/);
  await assert.rejects(runWithFarm('farm-target', () => writeJson('cattle.json', [{ id: 'late-cow' }])), /ACCOUNT_RETIRED/);
  await assert.rejects(runWithFarm('farm-target', () => readJson('cattle.json', [])), /ACCOUNT_RETIRED/);
  await runWithFarm('farm-other', () => writeJson('cattle.json', [{ id: 'other-updated' }]));
  assert.deepEqual(JSON.parse(await raw('farms/farm-other/cattle.json')), [{ id: 'other-updated' }]);
});

test('deletion and unrelated account creation/profile updates do not overwrite one another', async () => {
  const expected = await confirmation();
  await Promise.all([
    deleteOperatorFreeAccount('target', 'operator', expected),
    createUser({ farmId: 'farm-new', farmName: 'New Fixture', name: 'New Owner', email: 'new@example.invalid', password: 'fixture-password' }),
    updateUserProfileById('other', { farmName: 'Other Updated', name: 'Other Owner' }),
  ]);
  const stored = JSON.parse(await raw('users.json')) as FarmProUser[];
  assert.equal(stored.length, 3);
  assert(!stored.some((item) => item.id === 'target'));
  assert(stored.some((item) => item.email === 'new@example.invalid'));
  assert.equal(stored.find((item) => item.id === 'other')?.farmName, 'Other Updated');
});

test('unsafe directory links and path traversal are rejected without touching the other farm', async () => {
  const other = await raw('farms/farm-other/cattle.json');
  await fs.rm(path.join(root, 'farms/farm-target'), { recursive: true });
  await fs.symlink(path.join(root, 'farms/farm-other'), path.join(root, 'farms/farm-target'));
  await assert.rejects(getOperatorDeletionPreview('target', 'operator'), /ACCOUNT_DATA_REVIEW_REQUIRED/);
  await put('users.json', [users[0], { ...users[1], farmId: '../farm-other' }, users[2]]);
  await assert.rejects(getOperatorDeletionPreview('target', 'operator'), /ACCOUNT_DATA_REVIEW_REQUIRED/);
  assert.equal(await raw('farms/farm-other/cattle.json'), other);
  assert.deepEqual(await readAccountRetirements(), []);
});

test('interrupted erasure remains access-blocked and can be retried without deleting another farm', async () => {
  const expected = await confirmation();
  await put('farms/farm-demo/pendingPasswordResets.json', {});
  assert.equal((await request('/api/operator/users/target/delete', expected)).status, 503);
  assert.equal((await readAccountRetirements()).length, 1);
  assert.equal(await authenticate(users[1].email, 'fixture-password'), null);
  assert.equal((await request('/api/probe', undefined, users[1])).status, 401);
  const listed = await listUsersForOperator();
  const target = listed.find((item) => item.id === 'target');
  assert(target && 'accountDeletionPending' in target && target.accountDeletionPending);
  assert.equal(target.active, false);
  assert.equal((await request('/api/operator/users/ai-unanswered')).status, 200);
  await updateUserProfileById('other', { farmName: 'Other Continues Working', name: 'Other Owner' });
  await put('farms/farm-demo/pendingPasswordResets.json', []);
  assert.equal((await request('/api/operator/users/target/delete', expected)).status, 200);
  assert.equal((await listUsersForOperator()).length, 2);
});

test('reusing an email creates a new farm and old reset codes or verified identities cannot modify it', async () => {
  const { code } = await createPendingPasswordReset(users[1].email);
  const oldPending = JSON.parse(await raw('farms/farm-demo/pendingPasswordResets.json'));
  const verified = await verifyPendingPasswordReset(users[1].email, code);
  await deleteOperatorFreeAccount('target', 'operator', await confirmation());
  const newUser = await createUser({ farmId: 'farm-replacement', farmName: 'Replacement', name: 'New Owner', email: users[1].email, password: 'replacement-password' });
  assert.notEqual(newUser.id, 'target');
  await assert.rejects(resetPassword(newUser.email, 'attacker-password', verified.userId), /USER_NOT_FOUND/);
  await put('farms/farm-demo/pendingPasswordResets.json', oldPending);
  await assert.rejects(verifyPendingPasswordReset(newUser.email, code), /VERIFICATION_NOT_FOUND/);
  const legacy = oldPending.map(({ userId, ...item }: { userId?: string }) => item);
  await put('farms/farm-demo/pendingPasswordResets.json', legacy);
  await assert.rejects(verifyPendingPasswordReset(newUser.email, code), /VERIFICATION_NOT_FOUND/);
  const fresh = await createPendingPasswordReset(newUser.email);
  const response = await request('/api/auth/password-reset/verify', { email: newUser.email, code: fresh.code, newPassword: 'new-valid-password' }, null);
  assert.equal(response.status, 204);
  assert(await authenticate(newUser.email, 'new-valid-password'));
  await assert.rejects(createUser({ farmId: 'farm-target', farmName: 'Old Farm', name: 'Old Owner', email: 'reuse@example.invalid', password: 'fixture-password' }), /ACCOUNT_RETIRED/);
});

test('unknown users and invalid retirement metadata never return a deletion success', async () => {
  assert.equal((await request('/api/operator/users/missing/deletion-preview')).status, 404);
  await put('account-retirements.json', {});
  assert.equal((await request('/api/probe')).status, 503);
  assert.equal((await request('/api/auth/login', { email: users[0].email, password: 'fixture-password' }, null)).status, 503);
  assert.equal(JSON.parse(await raw('users.json')).length, 3);
});
