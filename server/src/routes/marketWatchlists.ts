import { Router } from 'express';
import { getMarketWatchlist, updateMarketWatchlist } from '../marketWatchlistStore';

export const marketWatchlistsRouter = Router();

function identity(res: import('express').Response) {
  const user = res.locals.authUser;
  if (!user?.id || !user.farmId) throw new Error('MARKET_IDENTITY_MISSING');
  return { farmId: user.farmId, userId: user.id, plan: user.plan };
}
function isEligible(plan: string) { return plan === 'standard' || plan === 'pro'; }
marketWatchlistsRouter.get('/', async (_req, res) => {
  try {
    const { farmId, userId, plan } = identity(res);
    if (!isEligible(plan)) { res.status(403).json({ message: 'PC・スマホ同期はStandard・Proで利用できます' }); return; }
    res.set('Cache-Control', 'no-store');
    res.json(await getMarketWatchlist(farmId, userId));
  } catch (error) {
    console.error('Market watchlist read error', error);
    res.status(503).json({ message: '市場選択情報を取得できませんでした' });
  }
});
marketWatchlistsRouter.put('/', async (req, res) => {
  try {
    const { farmId, userId, plan } = identity(res);
    if (!isEligible(plan)) { res.status(403).json({ message: 'PC・スマホ同期はStandard・Proで利用できます' }); return; }
    const revision = req.body?.baseRevision;
    if (!Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(req.body?.markets)) {
      res.status(400).json({ message: '市場選択情報が不正です' });
      return;
    }
    const result = await updateMarketWatchlist(farmId, userId, revision, req.body.markets);
    res.set('Cache-Control', 'no-store');
    if (result.status === 'conflict') {
      res.status(409).json({ message: '別の端末で市場選択が変更されました', ...result.value });
      return;
    }
    res.json(result.value);
  } catch (error) {
    if (error instanceof Error && ['INVALID_MARKET_WATCHLIST','DUPLICATE_MARKET_WATCH','INVALID_MARKET_REVISION','INVALID_MARKET_IDENTITY'].includes(error.message)) {
      res.status(400).json({ message: '市場選択情報が不正です' });
      return;
    }
    console.error('Market watchlist update error', error);
    res.status(503).json({ message: '市場選択情報を保存できませんでした' });
  }
});
