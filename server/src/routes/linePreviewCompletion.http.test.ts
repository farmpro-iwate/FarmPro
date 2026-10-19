import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { linePreviewCompletionRouter } from './linePreviewCompletion';

test('isolated LINE completion page responds without caching or token exposure', async () => {
  const app = express();
  app.use(linePreviewCompletionRouter);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TEST_PORT_MISSING');
    const response = await fetch('http://127.0.0.1:' + address.port + '/login/email?line=complete');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy') || '', /default-src 'none'/);
    const html = await response.text();
    assert.match(html, /LINEログイン検証/);
    assert.match(html, /\/api\/auth\/line\/finish/);
    assert.doesNotMatch(html, /localStorage|sessionStorage|farmpro\.authToken/);
    assert.doesNotMatch(html, /<input[^>]*type=['"]password/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
