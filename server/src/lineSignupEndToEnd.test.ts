import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { lineLoginRouter } from './routes/lineLogin';
import { issueLineSignupTicket } from './lineSignupTicket';
import { resolveLineLinkedUserId } from './lineIdentityStore';
import { verifyToken } from './authStore';

test('LINE signup API creates Free account, rejects duplicate, and authenticates token', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-line-api-'));
  const saved = {dir:process.env.FARMPRO_DATA_DIR,secret:process.env.FARMPRO_AUTH_SECRET,origin:process.env.FARMPRO_ALLOWED_ORIGIN,enabled:process.env.FARMPRO_LINE_SIGNUP_ENABLED,apiKey:process.env.RESEND_API_KEY,from:process.env.FARMPRO_EMAIL_FROM,notify:process.env.FARMPRO_REGISTRATION_NOTIFICATION_EMAIL};
  const realFetch=globalThis.fetch;
  const emails: Array<{text:string;html:string}> = [];
  let failNotification = false;
  globalThis.fetch=(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if(String(input)==='https://api.resend.com/emails') {
      const body=JSON.parse(String(init?.body));
      emails.push({text:body.text,html:body.html});
      if (failNotification) return new Response(JSON.stringify({error:{message:'synthetic failure'}}),{status:503});
      return new Response(JSON.stringify({id:'test-notification'}),{status:200});
    }
    return realFetch(input,init);
  }) as typeof fetch;
  process.env.FARMPRO_DATA_DIR=root;
  process.env.FARMPRO_AUTH_SECRET='line-api-test-secret';
  process.env.FARMPRO_ALLOWED_ORIGIN='https://farmpro.example';
  process.env.FARMPRO_LINE_SIGNUP_ENABLED='true';
  process.env.RESEND_API_KEY='test-only-key';
  process.env.FARMPRO_EMAIL_FROM='sender@example.invalid';
  process.env.FARMPRO_REGISTRATION_NOTIFICATION_EMAIL='operator@example.invalid';
  const app=express();app.use(express.json());app.use('/api/auth/line',lineLoginRouter);
  const server=app.listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    const addr=server.address();assert(addr&&typeof addr!=='string');
    const endpoint=`http://127.0.0.1:${addr.port}/api/auth/line/signup/complete`;
    const ticket=issueLineSignupTicket('UverifiedApiSignup123');
    const call=(signupTicket=ticket)=>fetch(endpoint,{method:'POST',headers:{
      'Content-Type':'application/json',Origin:'https://farmpro.example',
      Cookie:`farmpro_line_signup=${signupTicket}`,
    },body:JSON.stringify({farmName:'Farm One',name:'Owner One',confirm:true})});
    const first=await call();assert.equal(first.status,201);
    const data=await first.json() as {token:string;user:{id:string;farmId:string;plan:string;email?:string}};
    assert.equal(data.user.plan,'free');assert.equal(data.user.email,undefined);
    assert.equal((await verifyToken(data.token))?.id,data.user.id);
    assert.equal(await resolveLineLinkedUserId('UverifiedApiSignup123'),data.user.id);
    const second=await call();assert.equal(second.status,409);
    const users=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.equal(users.length,1);
    assert.equal(users[0].id,data.user.id);
    assert.equal(emails.length,1);
    assert.match(emails[0].text,/登録方法: LINE/);
    assert.match(emails[0].text,/未登録（LINE専用）/);
    // A failed operator notification must not erase the committed account.
    failNotification = true;
    const secondTicket=issueLineSignupTicket('UverifiedApiSignup456');
    const failureMail=await call(secondTicket);
    assert.equal(failureMail.status,201);
    const secondUser=await failureMail.json() as {token:string;user:{id:string}};
    assert.equal((await verifyToken(secondUser.token))?.id,secondUser.user.id);
    assert.equal(await resolveLineLinkedUserId('UverifiedApiSignup456'),secondUser.user.id);
    assert.equal((await call(secondTicket)).status,409);
    assert.equal(emails.length,2);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8')).length,2);
  } finally {
    globalThis.fetch=realFetch;
    await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    if(saved.dir===undefined)delete process.env.FARMPRO_DATA_DIR;else process.env.FARMPRO_DATA_DIR=saved.dir;
    if(saved.secret===undefined)delete process.env.FARMPRO_AUTH_SECRET;else process.env.FARMPRO_AUTH_SECRET=saved.secret;
    if(saved.origin===undefined)delete process.env.FARMPRO_ALLOWED_ORIGIN;else process.env.FARMPRO_ALLOWED_ORIGIN=saved.origin;
    if(saved.enabled===undefined)delete process.env.FARMPRO_LINE_SIGNUP_ENABLED;else process.env.FARMPRO_LINE_SIGNUP_ENABLED=saved.enabled;
    if(saved.apiKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=saved.apiKey;
    if(saved.from===undefined)delete process.env.FARMPRO_EMAIL_FROM;else process.env.FARMPRO_EMAIL_FROM=saved.from;
    if(saved.notify===undefined)delete process.env.FARMPRO_REGISTRATION_NOTIFICATION_EMAIL;else process.env.FARMPRO_REGISTRATION_NOTIFICATION_EMAIL=saved.notify;
    await fs.rm(root,{recursive:true,force:true});
  }
});
