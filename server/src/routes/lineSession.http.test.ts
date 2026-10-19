import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { lineSessionRouter } from './lineSession';

test('isolated LINE routes fail closed without LINE credentials or handoff cookie', async () => {
  const app=express();
  app.use('/api/auth/line', lineSessionRouter);
  const server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if (!address || typeof address === 'string') throw new Error('TEST_PORT_MISSING');
  const root='http://127.0.0.1:'+address.port;
  const original={id:process.env.LINE_LOGIN_CHANNEL_ID,secret:process.env.LINE_LOGIN_CHANNEL_SECRET,callback:process.env.LINE_LOGIN_CALLBACK_URL};
  delete process.env.LINE_LOGIN_CHANNEL_ID;
  delete process.env.LINE_LOGIN_CHANNEL_SECRET;
  delete process.env.LINE_LOGIN_CALLBACK_URL;
  try {
    const start=await fetch(root+'/api/auth/line/start',{redirect:'manual'});
    assert.equal(start.status,503);
    const callback=await fetch(root+'/api/auth/line/callback?state=bad&code=test',{redirect:'manual'});
    assert.equal(callback.status,400);
    const finish=await fetch(root+'/api/auth/line/finish',{method:'POST',headers:{Origin:'https://not-allowed.example'}});
    assert.equal(finish.status,403);
  } finally {
    if(original.id===undefined)delete process.env.LINE_LOGIN_CHANNEL_ID;else process.env.LINE_LOGIN_CHANNEL_ID=original.id;
    if(original.secret===undefined)delete process.env.LINE_LOGIN_CHANNEL_SECRET;else process.env.LINE_LOGIN_CHANNEL_SECRET=original.secret;
    if(original.callback===undefined)delete process.env.LINE_LOGIN_CALLBACK_URL;else process.env.LINE_LOGIN_CALLBACK_URL=original.callback;
    await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
});
