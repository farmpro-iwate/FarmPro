import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeMarketResults, listMarketResults, saveMarketResults, claimResultNotification } from './marketResultsStore';
import { pollApprovedMarketResults } from './approvedMarketFeed';

const sample = {
  prefecture:'岩手県',marketName:'県南家畜市場',periodStart:'2026-11-01',
  periodEnd:'2026-11-03',publishedAt:'2026-11-05T00:00:00Z',
  breed:'黒毛和種',sex:'mixed',headCount:240,averagePriceYen:700000,
  priceIncludesTax:true,status:'preliminary',sourceRevision:'1',
  sourceUrl:'https://example.org/market-results/1',
};
test('source records validate dates and prices without fabricating missing values', () => {
  const a = normalizeMarketResults('approved-feed',[sample]);
  assert.equal(a[0].averagePriceYen,700000);
  assert.equal(a[0].priceIncludesTax,true);
  assert.equal(a[0].periodStart,'2026-11-01');
  assert.throws(() => normalizeMarketResults('approved-feed',[{...sample,periodStart:'2026/11/01'}]), /INVALID_MARKET_FEED/);
  assert.throws(() => normalizeMarketResults('approved-feed',[{...sample,averagePriceYen:-100}]), /INVALID_MARKET_FEED/);
  assert.throws(() => normalizeMarketResults('approved-feed',[sample,sample]), /DUPLICATE_MARKET_RESULT/);
});
test('result ingestion is idempotent and persisted notification claims are deduplicated',async() => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'farmpro-market-results-'));
  const old = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    const item = normalizeMarketResults('approved-feed',[sample]);
    assert.equal((await saveMarketResults(item)).length,1);
    assert.equal((await saveMarketResults(item)).length,0);
    assert.equal((await listMarketResults()).length,1);
    assert.equal(await claimResultNotification('farm-a:user-a:' + item[0].id),true);
    assert.equal(await claimResultNotification('farm-a:user-a:' + item[0].id),false);
  } finally {
    if(old === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR=old;
    await fs.rm(root,{recursive:true,force:true});
  }
});
test('approved feed is disabled unless explicitly authorized and configured',async() => {
  const previous = process.env.FARMPRO_MARKET_FEED_APPROVED;
  delete process.env.FARMPRO_MARKET_FEED_APPROVED;
  try {
    assert.deepEqual(await pollApprovedMarketResults(),{enabled:false,added:0});
  } finally {
    if(previous === undefined) delete process.env.FARMPRO_MARKET_FEED_APPROVED;
    else process.env.FARMPRO_MARKET_FEED_APPROVED=previous;
  }
});
