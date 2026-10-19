import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { lineSessionRouter } from './lineSession';

test('LINE availability is enabled only when all OAuth settings exist', async () => {
  const original = {
    id: process.env.LINE_LOGIN_CHANNEL_ID,
    secret: process.env.LINE_LOGIN_CHANNEL_SECRET,
    callback: process.env.LINE_LOGIN_CALLBACK_URL,
  };
  const app = express();
  app.use('/api/auth/line', lineSessionRouter);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TEST_PORT_MISSING');
    const url = 'http://127.0.0.1:' + address.port + '/api/auth/line/availability';
    delete process.env.LINE_LOGIN_CHANNEL_ID;
    delete process.env.LINE_LOGIN_CHANNEL_SECRET;
    delete process.env.LINE_LOGIN_CALLBACK_URL;
    let response = await fetch(url);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { available: false });
    process.env.LINE_LOGIN_CHANNEL_ID = 'test-channel';
    process.env.LINE_LOGIN_CHANNEL_SECRET = 'test-secret';
    process.env.LINE_LOGIN_CALLBACK_URL = 'https://test.example/api/auth/line/callback';
    response = await fetch(url);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { available: true });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    for (const [key, val] of Object.entries({
      LINE_LOGIN_CHANNEL_ID: original.id,
      LINE_LOGIN_CHANNEL_SECRET: original.secret,
      LINE_LOGIN_CALLBACK_URL: original.callback,
    })) {
      if (val === undefined) delete process.env[key]; else process.env[key] = val;
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
