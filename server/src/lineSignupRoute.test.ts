import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { lineLoginRouter } from './routes/lineLogin';

test('LINE signup API refuses missing verified OAuth cookie and untrusted origins', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth/line', lineLoginRouter);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/auth/line/signup/complete`;
    const body = JSON.stringify({farmName:'Test farm',name:'Test owner',confirm:true});
    const wrongOrigin = await fetch(url, {method:'POST', headers:{
      'Content-Type':'application/json', Origin:'https://untrusted.example',
    },body});
    assert.equal(wrongOrigin.status,403);
    const previous = process.env.FARMPRO_ALLOWED_ORIGIN;
    process.env.FARMPRO_ALLOWED_ORIGIN = 'https://farmpro.example';
    try {
      const missingProof = await fetch(url, {method:'POST',headers:{
        'Content-Type':'application/json',Origin:'https://farmpro.example',
      },body});
      assert.equal(missingProof.status,401);
    } finally {
      if(previous===undefined) delete process.env.FARMPRO_ALLOWED_ORIGIN;
      else process.env.FARMPRO_ALLOWED_ORIGIN=previous;
    }
  } finally { await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve())); }
});

test('LINE availability is hidden without complete credentials and never exposes secrets', async () => {
  const keys=['LINE_LOGIN_CHANNEL_ID','LINE_LOGIN_CHANNEL_SECRET','LINE_LOGIN_CALLBACK_URL'] as const;
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const app=express();app.use('/api/auth/line',lineLoginRouter);
  const server=app.listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    const address=server.address();assert(address&&typeof address!=='string');
    const url=`http://127.0.0.1:${address.port}/api/auth/line/availability`;
    for(const key of keys) delete process.env[key];
    const off=await fetch(url);assert.equal(off.status,200);
    assert.deepEqual(await off.json(),{available:false});
    process.env.LINE_LOGIN_CHANNEL_ID='123456';
    process.env.LINE_LOGIN_CHANNEL_SECRET='test-secret-not-for-client';
    process.env.LINE_LOGIN_CALLBACK_URL='https://farmpro.example/api/auth/line/callback';
    const on=await fetch(url);assert.equal(on.status,200);
    const payload = await on.text();
    assert.deepEqual(JSON.parse(payload),{available:true});
    assert.equal(payload.includes('test-secret-not-for-client'),false);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    for(const key of keys) {
      if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
    }
  }
});
