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
    assert.match(users[0].lineSignupNonce,/^[a-f0-9]{32}$/);
    const session = await findActiveUserById('user-new-1');
    assert.equal('lineSignupNonce' in (session || {}),false);
  } finally {
    if(previousDir===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=previousDir;
    if(previousSecret===undefined) delete process.env.FARMPRO_AUTH_SECRET;
    else process.env.FARMPRO_AUTH_SECRET=previousSecret;
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('existing password owner and LINE-only owner coexist without crossing login identities', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'farmpro-mixed-auth-'));
  const previous={dir:process.env.FARMPRO_DATA_DIR,secret:process.env.FARMPRO_AUTH_SECRET};
  process.env.FARMPRO_DATA_DIR=root;process.env.FARMPRO_AUTH_SECRET='mixed-auth-test-secret';
  try {
    const {createUser,authenticate,verifyToken,createToken}=await import('./authStore');
    const emailOwner=await createUser({farmId:'farm-email-1',farmName:'Email farm',
      name:'Email owner',email:'owner@example.invalid',password:'test-password-123'});
    const lineOwner={id:'line-owner-1',farmId:'farm-line-1',farmName:'LINE farm',
      name:'LINE owner',role:'owner' as const,plan:'free' as const,
      loginMethod:'line' as const,active:true as const};
    await persistCanonicalLineSignup('UlineMixed123',lineOwner);
    assert.equal((await authenticate('owner@example.invalid','test-password-123'))?.id,emailOwner.id);
    assert.equal(await authenticate('line-owner-1@example.invalid','test-password-123'),null);
    assert.equal(await resolveLineLinkedUserId('UlineMixed123'),lineOwner.id);
    assert.equal((await verifyToken(createToken(emailOwner)))?.farmId,'farm-email-1');
    const lineSession=await findActiveUserById(lineOwner.id);
    assert(lineSession);
    assert.equal((await verifyToken(createToken(lineSession)))?.farmId,'farm-line-1');
    const saved=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.equal(saved.length,2);
  } finally {
    if(previous.dir===undefined)delete process.env.FARMPRO_DATA_DIR;else process.env.FARMPRO_DATA_DIR=previous.dir;
    if(previous.secret===undefined)delete process.env.FARMPRO_AUTH_SECRET;else process.env.FARMPRO_AUTH_SECRET=previous.secret;
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('concurrent email and LINE signup retain both accounts', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'farmpro-concurrent-signup-'));
  const previous=process.env.FARMPRO_DATA_DIR;process.env.FARMPRO_DATA_DIR=root;
  try {
    const {createUser}=await import('./authStore');
    const [email,line]=await Promise.all([
      createUser({farmId:'farm-concurrent-email',farmName:'Email Farm',name:'Owner',
        email:'concurrent@example.invalid',password:'secure-test-password'}),
      persistCanonicalLineSignup('UconcurrentLine123',{
        id:'line-concurrent',farmId:'farm-concurrent-line',farmName:'LINE Farm',
        name:'Owner',loginMethod:'line',role:'owner',active:true,plan:'free',
      }),
    ]);
    assert.equal(email.farmId,'farm-concurrent-email');
    assert.equal(line,undefined);
    const users=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.equal(users.length,2);
    assert(users.some((row:{id:string})=>row.id===email.id));
    assert(users.some((row:{id:string})=>row.id==='line-concurrent'));
  } finally {
    if(previous===undefined)delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=previous;
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('LINE signup remains readable after reopening durable data directory', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'farmpro-line-reopen-'));
  const previous=process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR=root;
  try {
    const user={id:'line-reopen',farmId:'farm-reopen',farmName:'Persisted Farm',
      name:'Owner',loginMethod:'line' as const,role:'owner' as const,
      plan:'free' as const,active:true as const};
    await persistCanonicalLineSignup('UpersistedLine123',user);
    // The next lookup reopens JSON on disk, rather than using an in-memory session.
    assert.equal(await resolveLineLinkedUserId('UpersistedLine123'),user.id);
    const stored=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.equal(stored[0].lineSubject,'UpersistedLine123');
    assert.equal((await findActiveUserById(user.id))?.farmId,user.farmId);
  } finally {
    if(previous===undefined)delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=previous;
    await fs.rm(root,{recursive:true,force:true});
  }
});
