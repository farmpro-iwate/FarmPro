import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { persistCanonicalLineSignup } from './lineCanonicalSignupStore';
import { findActiveUserById, authenticate } from './authStore';

test('LINE signup preserves existing email account and rejects replay', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-canonical-stage-'));
  const old = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const legacy = { id: 'old-user', farmId:'old-farm', farmName:'Existing', name:'Existing Owner', email:'old@example.invalid',passwordSalt:'salt',passwordHash:'hash',role:'owner',active:true,plan:'free' };
    await fs.writeFile(path.join(root, 'users.json'), JSON.stringify([legacy]));
    const line = { id:'line-user',farmId:'line-farm',farmName:'LINE Farm',name:'LINE Owner',loginMethod:'line' as const,role:'owner' as const,active:true as const,plan:'free' as const };
    await persistCanonicalLineSignup('UisolatedTest123',line);
    const stored = JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.deepEqual(stored[0],legacy);
    assert.equal(stored.length,2);
    assert.equal((await findActiveUserById(line.id))?.farmId,line.farmId);
    assert.equal('lineSubject' in ((await findActiveUserById(line.id)) || {}),false);
    assert.equal(await authenticate('line-user@example.invalid','password'),null);
    await assert.rejects(persistCanonicalLineSignup('UisolatedTest123',{...line,id:'another-user',farmId:'another-farm'}),/LINE_SIGNUP_ALREADY_EXISTS/);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8')).length,2);
  } finally {
    if (old === undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(root,{recursive:true,force:true});
  }
});
