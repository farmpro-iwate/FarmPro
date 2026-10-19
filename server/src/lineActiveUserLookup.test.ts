import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findActiveUserById } from './authStore';

test('LINE handoff user lookup is read-only and never selects another farm', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-lookup-'));
  const old = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  const users = [
    {id:'owner-a',farmId:'farm-a',farmName:'A',name:'Owner A',email:'a@example.invalid',passwordSalt:'salt',passwordHash:'hash',role:'owner',active:true,plan:'free'},
    {id:'owner-b',farmId:'farm-b',farmName:'B',name:'Owner B',email:'b@example.invalid',passwordSalt:'salt',passwordHash:'hash',role:'owner',active:false,plan:'standard'}
  ];
  try {
    const original=JSON.stringify(users);
    await fs.writeFile(path.join(root,'users.json'),original);
    const found=await findActiveUserById('owner-a');
    assert.equal(found?.id,'owner-a');
    assert.equal(found?.farmId,'farm-a');
    assert.equal('passwordHash' in (found ?? {}),false);
    assert.equal('passwordSalt' in (found ?? {}),false);
    assert.equal(await findActiveUserById('owner-b'),null);
    assert.equal(await findActiveUserById('missing'),null);
    assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),original);
  } finally {
    if(old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(root,{recursive:true,force:true});
  }
});
