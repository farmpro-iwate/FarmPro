import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPasswordHash, authenticate, createToken, verifyToken, findActiveUserById, emailExists, listUsersForOperator } from './authStore';
import { persistCanonicalLineSignup } from './lineCanonicalSignupStore';
import { issueLineHandoff } from './lineLoginHandoff';
import { finishLineLoginSession } from './lineLoginSessionFinish';

test('LINE-only and legacy email accounts coexist without crossing farm or token identity', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-coexist-'));
  const priorDir = process.env.FARMPRO_DATA_DIR;
  const priorSecret = process.env.FARMPRO_AUTH_SECRET;
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'line-coexistence-test-secret';
  try {
    const password = 'legacy-password-123';
    const hashes = createPasswordHash(password);
    const legacy = { id: 'email-owner', farmId: 'farm-email', farmName: 'Existing farm', name: 'Owner', email: 'owner@example.invalid', ...hashes, role: 'owner', active: true, plan: 'standard' };
    await fs.writeFile(path.join(root, 'users.json'), JSON.stringify([legacy]));
    await persistCanonicalLineSignup('UlineCoexistenceTest', { id: 'line-owner', farmId: 'farm-line', farmName: 'Isolated LINE farm', name: 'Line owner', loginMethod: 'line', role: 'owner', active: true, plan: 'free' });
    const mail = await authenticate('owner@example.invalid', password);
    assert.equal(mail?.id, 'email-owner');
    assert.equal(mail?.farmId, 'farm-email');
    assert.equal(mail?.plan, 'standard');
    assert.equal(await emailExists('owner@example.invalid'), true);
    assert.equal(await authenticate('line@example.invalid', password), null);
    const operators = await listUsersForOperator();
    assert.equal(operators.length, 2);
    assert.equal(operators.find(row => row.id === 'line-owner')?.farmId, 'farm-line');
    assert.equal(operators.find(row => row.id === 'email-owner')?.email, 'owner@example.invalid');
    assert.equal('passwordHash' in operators[0], false);
    const line = await finishLineLoginSession(await issueLineHandoff('line-owner'));
    assert.equal(line.user.id, 'line-owner');
    assert.equal(line.user.farmId, 'farm-line');
    assert.equal('lineSubject' in line.user, false);
    assert.equal('passwordHash' in line.user, false);
    assert.equal((await verifyToken(line.token))?.farmId, 'farm-line');
    assert.equal((await verifyToken(createToken(mail!)))?.farmId, 'farm-email');
    assert.equal((await findActiveUserById('email-owner'))?.farmId, 'farm-email');
    const data = JSON.parse(await fs.readFile(path.join(root, 'users.json'), 'utf8'));
    assert.equal(data.length, 2);
    assert.equal(data[0].passwordHash, legacy.passwordHash);
    assert.equal(data[0].farmId, legacy.farmId);
  } finally {
    if (priorDir === undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR = priorDir;
    if (priorSecret === undefined) delete process.env.FARMPRO_AUTH_SECRET; else process.env.FARMPRO_AUTH_SECRET = priorSecret;
    await fs.rm(root, { recursive: true, force: true });
  }
});
