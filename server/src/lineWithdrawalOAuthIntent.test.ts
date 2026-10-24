import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { issueLineWithdrawalOAuthIntent, consumeLineWithdrawalOAuthIntent } from './lineWithdrawalOAuthIntent';

test('withdrawal OAuth intent is separate, browser-bound, farm-bound, single-use and preserves cattle', async () => {
  const prev = process.env.FARMPRO_DATA_DIR;
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'farmpro-line-withdrawal-oauth-'));
  try {
    process.env.FARMPRO_DATA_DIR=root;
    const actor={id:'user-one',farmId:'farm-one'};
    const secret='a'.repeat(64);
    await fs.mkdir(path.join(root,'farms','farm-one'),{recursive:true});
    await fs.writeFile(path.join(root,'farms','farm-one','cattle.json'),'[]');
    const first=await issueLineWithdrawalOAuthIntent(actor,secret);
    await assert.rejects(consumeLineWithdrawalOAuthIntent(first.state,'b'.repeat(64),actor));
    await assert.rejects(consumeLineWithdrawalOAuthIntent(first.state,secret,actor));
    const second=await issueLineWithdrawalOAuthIntent(actor,secret);
    await assert.rejects(consumeLineWithdrawalOAuthIntent(second.state,secret,{id:'user-one',farmId:'farm-two'}));
    const third=await issueLineWithdrawalOAuthIntent(actor,secret);
    assert.equal(await consumeLineWithdrawalOAuthIntent(third.state,secret,actor),third.nonce);
    await assert.rejects(consumeLineWithdrawalOAuthIntent(third.state,secret,actor));
    const expired=await issueLineWithdrawalOAuthIntent(actor,secret,Date.now()-360000);
    await assert.rejects(consumeLineWithdrawalOAuthIntent(expired.state,secret,actor));
    assert.equal(await fs.readFile(path.join(root,'farms','farm-one','cattle.json'),'utf8'),'[]');
    await assert.rejects(fs.stat(path.join(root,'account-withdrawals.json')),{code:'ENOENT'});
  } finally {
    if(prev===undefined)delete process.env.FARMPRO_DATA_DIR;else process.env.FARMPRO_DATA_DIR=prev;
    await fs.rm(root,{force:true,recursive:true});
  }
});
