import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { persistVerifiedLineLink, resolveLineLinkedUserId } from './lineIdentityStore';

test('linking legacy email account preserves every user and farm field', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'farmpro-link-isolation-'));
  const previous=process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR=root;
  const users=[
    {id:'owner-legacy',farmId:'farm-legacy',active:true,role:'owner',plan:'standard',email:'legacy@example.invalid',passwordSalt:'salt',passwordHash:'hash',farmName:'Original Farm',stripeCustomerId:'cus_fixture'},
    {id:'other-owner',farmId:'farm-other',active:true,role:'owner',plan:'free',email:'other@example.invalid'}
  ];
  try {
    const before=JSON.stringify(users);
    await fs.writeFile(path.join(root,'users.json'),before);
    await persistVerifiedLineLink('UlegacyA','owner-legacy');
    assert.equal(await resolveLineLinkedUserId('UlegacyA'),'owner-legacy');
    assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),before);
    await assert.rejects(persistVerifiedLineLink('UlegacyA','other-owner'),/LINE_IDENTITY_ALREADY_LINKED/);
    await assert.rejects(persistVerifiedLineLink('UlegacyB','owner-legacy'),/FARMPRO_USER_ALREADY_LINKED/);
    assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),before);
  } finally {
    if(previous===undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=previous;
    await fs.rm(root,{recursive:true,force:true});
  }
});
