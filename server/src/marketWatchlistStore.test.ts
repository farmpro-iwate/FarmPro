import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getMarketWatchlist, updateMarketWatchlist } from './marketWatchlistStore';

test('market watchlists sync without cross-farm or cross-user leakage', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-market-sync-'));
  const previous = process.env.FARMPRO_DATA_DIR;
  process.env.FARMPRO_DATA_DIR = root;
  try {
    assert.equal((await getMarketWatchlist('farm-a', 'user-1')).revision, 0);
    const saved = await updateMarketWatchlist('farm-a','user-1',0,[
      {prefecture:'岩手県',name:'県南家畜市場',notify:true}
    ]);
    assert.equal(saved.status, 'saved');
    assert.equal(saved.value.revision, 1);
    assert.equal((await getMarketWatchlist('farm-a','user-1')).markets[0].name, '県南家畜市場');
    assert.deepEqual((await getMarketWatchlist('farm-b','user-1')).markets, []);
    assert.deepEqual((await getMarketWatchlist('farm-a','user-2')).markets, []);
    const stale = await updateMarketWatchlist('farm-a','user-1',0,[]);
    assert.equal(stale.status, 'conflict');
    assert.equal(stale.value.markets.length, 1);
    const newer = await updateMarketWatchlist('farm-a','user-1',1,[]);
    assert.equal(newer.status, 'saved');
    assert.equal((await getMarketWatchlist('farm-a','user-1')).revision, 2);
    await assert.rejects(() => updateMarketWatchlist('farm-a','user-1',2,[
      {prefecture:'岩手県',name:'県南家畜市場',notify:true},
      {prefecture:'岩手県',name:'県南家畜市場',notify:true},
    ]), /DUPLICATE_MARKET_WATCH/);
    await assert.rejects(() => updateMarketWatchlist('farm-a','user-1',2,[
      {prefecture:'不正県',name:'確認市場',notify:true}
    ]), /INVALID_MARKET_WATCHLIST/);
  } finally {
    if (previous === undefined) delete process.env.FARMPRO_DATA_DIR;
    else process.env.FARMPRO_DATA_DIR = previous;
    await fs.rm(root, { recursive:true, force:true });
  }
});
