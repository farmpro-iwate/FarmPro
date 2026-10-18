import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { issueLineHandoff, consumeLineHandoff } from './lineLoginHandoff';

test('handoff ticket is one-time and never persisted in plaintext', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'line-handoff-'));
  const previous = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = folder;
  try {
    const ticket = await issueLineHandoff('existing-user');
    const raw = await fs.readFile(path.join(folder, 'line-login-handoffs.json'), 'utf8');
    assert.equal(raw.includes(ticket), false);
    assert.equal(await consumeLineHandoff(ticket), 'existing-user');
    await assert.rejects(consumeLineHandoff(ticket), /LINE_HANDOFF_EXPIRED/);
    const another = await issueLineHandoff('second-user');
    assert.notEqual(ticket, another);
    await assert.rejects(consumeLineHandoff(crypto.randomBytes(32).toString('hex')), /LINE_HANDOFF_EXPIRED/);
  } finally {
    if (previous === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = previous;
    await fs.rm(folder, { recursive: true, force: true });
  }
});
