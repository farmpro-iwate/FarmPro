import { Router } from 'express';
import { listMarketResults } from '../marketResultsStore';
import { pollApprovedMarketResults } from '../approvedMarketFeed';

export const marketPublicResultsRouter = Router();
marketPublicResultsRouter.get('/', async (_req,res) => {
  try {
    res.set('Cache-Control','no-store');
    const results = await listMarketResults();
    res.json({ results: results.slice(-1000), sourceConfigured: process.env.FARMPRO_MARKET_FEED_APPROVED === '1' });
  } catch (error) {
    console.error('Market results read failed', error);
    res.status(503).json({ message:'子牛市場結果を確認できませんでした' });
  }
});
// No public write/update endpoint: only a configured approved provider can ingest results.
export { pollApprovedMarketResults };
