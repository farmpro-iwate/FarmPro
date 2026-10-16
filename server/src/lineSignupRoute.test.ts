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
