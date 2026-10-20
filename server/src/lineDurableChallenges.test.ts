import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { issueDurableLineChallenge, consumeDurableLineChallenge } from './lineDurableChallenges';

test('durable LINE challenge survives calls and is single-use and browser-bound', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'line-challenge-'));
  const prior = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = dir;
  try {
    const browser = crypto.randomBytes(32).toString('hex');
    const other = crypto.randomBytes(32).toString('hex');
    const first = await issueDurableLineChallenge(browser, 1000);
    assert.equal(await consumeDurableLineChallenge(first.state, browser, 1100), first.nonce);
    await assert.rejects(consumeDurableLineChallenge(first.state, browser, 1200), /LINE_STATE_EXPIRED_OR_BROWSER_MISMATCH/);
    const second = await issueDurableLineChallenge(browser, 2000);
    await assert.rejects(consumeDurableLineChallenge(second.state, other, 2100), /LINE_STATE_EXPIRED_OR_BROWSER_MISMATCH/);
    await assert.rejects(consumeDurableLineChallenge(second.state, browser, 2200), /LINE_STATE_EXPIRED_OR_BROWSER_MISMATCH/);
    const third = await issueDurableLineChallenge(browser, 3000);
    await assert.rejects(consumeDurableLineChallenge(third.state, browser, 603001), /LINE_STATE_EXPIRED_OR_BROWSER_MISMATCH/);
    const raw = await fs.readFile(path.join(dir, 'line-oauth-challenges.json'), 'utf8');
    assert.ok(!raw.includes(third.state), 'raw state must not be stored');
  } finally {
    if (prior === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
