import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeMarketResults, listMarketResults, saveMarketResults, claimResultNotification, isResultNotificationClaimed } from './marketResultsStore';
import { pollApprovedMarketResults, deliverMarketResultNotifications, isApprovedMarketFeedConfigured } from './approvedMarketFeed';

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
    assert.equal(await isResultNotificationClaimed('farm-a:user-a:' + item[0].id),false);
    assert.equal(await claimResultNotification('farm-a:user-a:' + item[0].id),true);
    assert.equal(await isResultNotificationClaimed('farm-a:user-a:' + item[0].id),true);
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

test('failed delivery retries while successful recipients do not get duplicates',async () => {
  const result = normalizeMarketResults('approved-feed',[{
    ...sample,publishedAt:new Date().toISOString()
  }])[0];
  const recipients = [
    { farmId:'farm-one', userId:'user-a', markets:[{prefecture:'岩手県',name:'県南家畜市場',notify:true}] },
    { farmId:'farm-one', userId:'user-b', markets:[{prefecture:'岩手県',name:'県南家畜市場',notify:true}] },
    { farmId:'other-farm', userId:'user-c', markets:[{prefecture:'岩手県',name:'別市場',notify:true}] },
  ];
  const sent = new Set<string>();
  const attempts = new Map<string,number>();
  const deps = {
    wasSent: async (key: string) => sent.has(key),
    markSent: async (key: string) => { if(sent.has(key)) return false; sent.add(key); return true; },
    send: async (_farmId: string,userId: string) => {
      const n=(attempts.get(userId)||0)+1; attempts.set(userId,n);
      if(userId==='user-a' && n===1) throw new Error('temporary push gateway failure');
      return { sent:1,missing:false };
    }
  };
  const initial=await deliverMarketResultNotifications([result],recipients,deps);
  assert.deepEqual(initial,{delivered:1,failures:1});
  assert.equal(attempts.has('user-c'),false);
  const retry=await deliverMarketResultNotifications([result],recipients,deps);
  assert.deepEqual(retry,{delivered:1,failures:0});
  assert.equal(attempts.get('user-b'),1);
  const final=await deliverMarketResultNotifications([result],recipients,deps);
  assert.deepEqual(final,{delivered:0,failures:0});
});

test('approved data source is not reported ready without all credentials and pinned host', () => {
  const keys = [
    'FARMPRO_MARKET_FEED_APPROVED','FARMPRO_MARKET_FEED_URL',
    'FARMPRO_MARKET_FEED_HOST','FARMPRO_MARKET_FEED_TOKEN',
    'FARMPRO_MARKET_FEED_SOURCE_ID'
  ] as const;
  const before = keys.map(key => process.env[key]);
  try {
    process.env.FARMPRO_MARKET_FEED_APPROVED='1';
    delete process.env.FARMPRO_MARKET_FEED_URL;
    assert.equal(isApprovedMarketFeedConfigured(), false);
    process.env.FARMPRO_MARKET_FEED_URL='http://example.org/results';
    process.env.FARMPRO_MARKET_FEED_HOST='example.org';
    process.env.FARMPRO_MARKET_FEED_TOKEN='ci-only';
    process.env.FARMPRO_MARKET_FEED_SOURCE_ID='ci-feed';
    assert.equal(isApprovedMarketFeedConfigured(), false);
    process.env.FARMPRO_MARKET_FEED_URL='https://example.org/results';
    assert.equal(isApprovedMarketFeedConfigured(), true);
    process.env.FARMPRO_MARKET_FEED_HOST='another.example.org';
    assert.equal(isApprovedMarketFeedConfigured(), false);
  } finally {
    keys.forEach((key,i) => {
      if (before[i] === undefined) delete process.env[key];
      else process.env[key] = before[i];
    });
  }
});
