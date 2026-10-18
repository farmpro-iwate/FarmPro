import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resetPassword } from './authStore';

test('LINE billing contact cannot obtain password login via reset', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'line-password-reset-'));
  const old = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  const users = [{id:'line-a',farmId:'farm-a',email:'billing@example.invalid',loginMethod:'line',active:true,role:'owner',plan:'free',lineSubject:'Usubject'}];
  try {
    const original = JSON.stringify(users);
    await fs.writeFile(path.join(root,'users.json'),original);
    await assert.rejects(resetPassword('billing@example.invalid','new-password-123'),/LINE_PASSWORD_RESET_DISABLED/);
    assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),original);
  } finally {
    if(old === undefined) delete process.env.FARMPRO_DATA_DIR; else process.env.FARMPRO_DATA_DIR = old;
    await fs.rm(root,{recursive:true,force:true});
  }
});
