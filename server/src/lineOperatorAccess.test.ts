import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { requireOperator } from './operatorAccess';

test('LINE-only owner is denied operator access without throwing', async () => {
  const previous = process.env.FARMPRO_OPERATOR_EMAILS;
  process.env.FARMPRO_OPERATOR_EMAILS = 'operator@example.invalid';
  const app = express();
  app.use((_req,res,next) => { res.locals.authUser = { id: 'line-user', farmId: 'line-farm', loginMethod: 'line' } as unknown as typeof res.locals.authUser; next(); });
  app.get('/operator', requireOperator, (_req,res) => res.sendStatus(200));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TEST_PORT_MISSING');
    const response = await fetch('http://127.0.0.1:' + address.port + '/operator');
    assert.equal(response.status, 403);
  } finally {
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
    if (previous === undefined) delete process.env.FARMPRO_OPERATOR_EMAILS;
    else process.env.FARMPRO_OPERATOR_EMAILS = previous;
  }
});
