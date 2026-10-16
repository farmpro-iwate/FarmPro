import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { bankTransferApplicationsRouter } from './routes/bankTransferApplications';
import type { AuthUser } from './authStore';

test('bank transfer API rejects email-less LINE account before writing, while email account can apply', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-bank-'));
  const before = {
    dir: process.env.FARMPRO_DATA_DIR,
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.FARMPRO_EMAIL_FROM,
    notify: process.env.FARMPRO_BANK_TRANSFER_NOTIFICATION_EMAIL,
  };
  const originalFetch = globalThis.fetch;
  let sent = 0;
  const line = { id: 'line-user', farmId: 'line-farm', farmName: 'LINE Farm', name: 'Owner', role: 'owner', active: true, plan: 'free', loginMethod: 'line' };
  const email = { ...line, id: 'email-user', farmId: 'email-farm', farmName: 'Email Farm', email: 'owner@example.invalid', loginMethod: 'email' };
  let actor: typeof line | typeof email = line;
  process.env.FARMPRO_DATA_DIR = root;
  process.env.RESEND_API_KEY = 'test-only-key';
  process.env.FARMPRO_EMAIL_FROM = 'sender@example.invalid';
  process.env.FARMPRO_BANK_TRANSFER_NOTIFICATION_EMAIL = 'operator@example.invalid';
  globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (String(url) === 'https://api.resend.com/emails') {
      sent++;
      return new Response(JSON.stringify({ id: 'mock-mail' }), { status: 200 });
    }
    return originalFetch(url, init);
  }) as typeof fetch;
  const app = express();
  app.use(express.json());
  app.use((_,res,next) => { // Exercise the actual email-less LINE JSON shape; the legacy AuthUser type
    // still requires email and is tracked separately as a migration blocker.
    res.locals.authUser = actor as unknown as AuthUser; next(); });
  app.use('/api/bank-transfer-applications', bankTransferApplicationsRouter);
  const server = app.listen(0,'127.0.0.1');
  try {
    await once(server, 'listening');
    const addr = server.address();
    assert(addr && typeof addr !== 'string');
    const url = `http://127.0.0.1:${addr.port}/api/bank-transfer-applications`;
    const submit = () => originalFetch(url, { method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:'standard'}) });
    const denied = await submit();
    assert.equal(denied.status,409);
    assert.equal((await denied.json() as {code:string}).code,'BILLING_EMAIL_REQUIRED');
    assert.equal(sent,0);
    assert.equal((await fs.readdir(root)).filter(name=>name.includes('bank')).length,0);
    actor = email;
    const allowed = await submit();
    assert.equal(allowed.status,201);
    assert.equal(sent,2);
    const data = await allowed.json() as {application:{email:string;userId:string}};
    assert.equal(data.application.email,email.email);
    assert.equal(data.application.userId,email.id);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    for (const [key,val] of Object.entries({FARMPRO_DATA_DIR:before.dir,RESEND_API_KEY:before.apiKey,FARMPRO_EMAIL_FROM:before.from,FARMPRO_BANK_TRANSFER_NOTIFICATION_EMAIL:before.notify})) {
      if (val===undefined) delete process.env[key]; else process.env[key]=val;
    }
    await fs.rm(root,{recursive:true,force:true});
  }
});
