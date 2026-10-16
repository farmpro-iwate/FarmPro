import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { persistCanonicalLineSignup, persistCanonicalLineSignupFromTicket } from './lineCanonicalSignupStore';
import { issueLineSignupTicket } from './lineSignupTicket';
import { resolveLineLinkedUserId } from './lineIdentityStore';
import { findActiveUserById } from './authStore';

test('canonical LINE signup is resolvable as an active FarmPro account without exposing its subject', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-canonical-line-'));
  const previous = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const user = { id: 'line-user-1', farmId: 'farm-line-1', farmName: 'LINE farm',
      name: 'LINE owner', loginMethod: 'line' as const, role: 'owner' as const,
      active: true as const, plan: 'free' as const };
    await persistCanonicalLineSignup('UlineTest123', user);
    assert.equal(await resolveLineLinkedUserId('UlineTest123'), user.id);
    const session = await findActiveUserById(user.id);
    assert.equal(session?.id, user.id);
    assert.equal('lineSubject' in (session || {}), false);
    await assert.rejects(persistCanonicalLineSignup('UlineTest123',
      {...user,id:'line-user-2',farmId:'farm-line-2'}), /LINE_SIGNUP_ALREADY_EXISTS/);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8')).length, 1);
  } finally {
    if(previous === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = previous;
    await fs.rm(root, {recursive:true,force:true});
  }
});

test('replaying one verified LINE signup ticket cannot create a second account', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-replay-'));
  const previousDir = process.env.FARMPRO_DATA_DIR;
  const previousSecret = process.env.FARMPRO_AUTH_SECRET;
  process.env.FARMPRO_DATA_DIR = root;
  process.env.FARMPRO_AUTH_SECRET = 'test-only-replay-secret';
  try {
    const ticket = issueLineSignupTicket('UverifiedReplay123');
    const candidate = {id:'user-new-1',farmId:'farm-new-1',farmName:'Farm',
      name:'Owner',loginMethod:'line' as const,role:'owner' as const,
      plan:'free' as const,active:true as const};
    await persistCanonicalLineSignupFromTicket(ticket,candidate);
    await assert.rejects(
      persistCanonicalLineSignupFromTicket(ticket,{...candidate,id:'user-new-2',farmId:'farm-new-2'}),
      /LINE_SIGNUP_ALREADY_EXISTS/,
    );
    const users=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.equal(users.length,1);
    assert.equal(users[0].id,'user-new-1');
  } finally {
    if(previousDir===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=previousDir;
    if(previousSecret===undefined) delete process.env.FARMPRO_AUTH_SECRET;
    else process.env.FARMPRO_AUTH_SECRET=previousSecret;
    await fs.rm(root,{recursive:true,force:true});
  }
});
