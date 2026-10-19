import crypto from 'node:crypto';
import { Router } from 'express';
import { getLineLoginConfig, makeLineAuthorizationUrl } from '../lineLoginOAuth';
import { issueDurableLineChallenge } from '../lineDurableChallenges';

/**
 * Isolated LINE OAuth start route, not mounted in app.ts.
 * Production rollout requires callback cookie binding and single-host
 * persistence validation before mounting.
 */
export const lineSessionStartRouter = Router();
lineSessionStartRouter.get('/start', async (_req, res) => {
  try {
    const config = getLineLoginConfig();
    if (!config) {
      res.status(503).json({ message: 'LINEログインは現在準備中です' });
      return;
    }
    const browserSecret = crypto.randomBytes(32).toString('hex');
    const challenge = await issueDurableLineChallenge(browserSecret);
    res.cookie('farmpro_line_oauth', browserSecret, {
      httpOnly: true, secure: true, sameSite: 'lax',
      path: '/api/auth/line', maxAge: 600_000,
    });
    res.redirect(302, makeLineAuthorizationUrl(config, challenge));
  } catch {
    res.status(503).json({ message: 'LINE認証を開始できませんでした' });
  }
});
