import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { persistCanonicalLineSignup } from './lineCanonicalSignupStore';
import { resolveLineLinkedUserId } from './lineIdentityStore';
import { findActiveUserById } from './authStore';

test('LINE subject resolves only its active FarmPro account', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'line-resolver-'));
  const old=process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR=root;
  try {
    const user={id:'line-owner',farmId:'line-farm',farmName:'LINE Farm',name:'Owner',loginMethod:'line' as const,role:'owner' as const,active:true as const,plan:'free' as const};
    await persistCanonicalLineSignup('UresolutionTest123',user);
    assert.equal(await resolveLineLinkedUserId('UresolutionTest123'),'line-owner');
    assert.equal(await resolveLineLinkedUserId('UotherTest123'),null);
    assert.equal((await findActiveUserById('line-owner'))?.farmId,'line-farm');
    const file=path.join(root,'users.json');
    const users=JSON.parse(await fs.readFile(file,'utf8'));
    users[0].active=false;
    await fs.writeFile(file,JSON.stringify(users));
    await assert.rejects(resolveLineLinkedUserId('UresolutionTest123'),/LINE_USER_UNAVAILABLE/);
  } finally {
    if(old===undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(root,{recursive:true,force:true});
  }
});
