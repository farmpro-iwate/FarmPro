import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import expensesRouter from './expenses';

test('settlement HTTP POST rejects a different farm and an unisolated environment', async () => {
  const before = {
    RENDER_SERVICE_NAME: process.env.RENDER_SERVICE_NAME,
    NODE_ENV: process.env.NODE_ENV,
    FARMPRO_DATA_DIR: process.env.FARMPRO_DATA_DIR,
    FARMPRO_SETTLEMENT_WRITE_PREVIEW: process.env.FARMPRO_SETTLEMENT_WRITE_PREVIEW,
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.authUser = {
      farmId: req.header('x-test-farm'),
      plan: 'standard',
    };
    next();
  });
  app.use('/api/expenses', expensesRouter);
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    const endpoint = `http://127.0.0.1:${address.port}/api/expenses/settlement-sync`;
    process.env.FARMPRO_SETTLEMENT_WRITE_PREVIEW = 'enabled';
    process.env.RENDER_SERVICE_NAME = 'farmpro-settlement-preview';
    process.env.NODE_ENV = 'production';
    process.env.FARMPRO_DATA_DIR = '/tmp/farmpro-settlement-preview-http-test';
    const post = (farm: string) => fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-farm': farm },
      body: JSON.stringify({}),
    });
    const wrongFarm = await post('another-farm');
    assert.equal(wrongFarm.status, 403);
    process.env.RENDER_SERVICE_NAME = 'other-service';
    const wrongService = await post('settlement-preview-only');
    assert.equal(wrongService.status, 403);
    process.env.RENDER_SERVICE_NAME = 'farmpro-settlement-preview';
    process.env.FARMPRO_DATA_DIR = '/var/data/farmpro';
    const wrongDataDir = await post('settlement-preview-only');
    assert.equal(wrongDataDir.status, 403);
  } finally {
    server.close();
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
