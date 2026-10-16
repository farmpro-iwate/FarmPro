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
  const saved = {dir:process.env.FARMPRO_DATA_DIR,secret:process.env.FARMPRO_AUTH_SECRET,origin:process.env.FARMPRO_ALLOWED_ORIGIN};
  process.env.FARMPRO_DATA_DIR=root;
  process.env.FARMPRO_AUTH_SECRET='line-api-test-secret';
  process.env.FARMPRO_ALLOWED_ORIGIN='https://farmpro.example';
  const app=express();app.use(express.json());app.use('/api/auth/line',lineLoginRouter);
  const server=app.listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    const addr=server.address();assert(addr&&typeof addr!=='string');
    const endpoint=`http://127.0.0.1:${addr.port}/api/auth/line/signup/complete`;
    const ticket=issueLineSignupTicket('UverifiedApiSignup123');
    const call=()=>fetch(endpoint,{method:'POST',headers:{
      'Content-Type':'application/json',Origin:'https://farmpro.example',
      Cookie:`farmpro_line_signup=${ticket}`,
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
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    if(saved.dir===undefined)delete process.env.FARMPRO_DATA_DIR;else process.env.FARMPRO_DATA_DIR=saved.dir;
    if(saved.secret===undefined)delete process.env.FARMPRO_AUTH_SECRET;else process.env.FARMPRO_AUTH_SECRET=saved.secret;
    if(saved.origin===undefined)delete process.env.FARMPRO_ALLOWED_ORIGIN;else process.env.FARMPRO_ALLOWED_ORIGIN=saved.origin;
    await fs.rm(root,{recursive:true,force:true});
  }
});
