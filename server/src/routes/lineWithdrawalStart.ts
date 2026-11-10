import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from '../authMiddleware';
import { isTrustedLineOrigin } from '../lineTrustedOrigin';
import { getLineLoginConfig, makeLineAuthorizationUrl } from '../lineLoginOAuth';
import { issueLineWithdrawalOAuthIntent } from '../lineWithdrawalOAuthIntent';
import { getNativeLineSubjectForSession } from '../lineIdentityStore';

/** Preview-only entry point: starts reauthentication but cannot authorize deletion. */
export const lineWithdrawalStartRouter = Router();
lineWithdrawalStartRouter.post('/start', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.FARMPRO_LINE_FULL_APP_PREVIEW !== 'true' || !isTrustedLineOrigin(req.get('Origin'))) {
    res.status(403).json({ message: 'LINE退会認証を開始できません' });
    return;
  }
  const actor = res.locals.authUser!;
  try {
    const config = getLineLoginConfig();
    if (!config || !(await getNativeLineSubjectForSession(actor.id, actor.farmId))) {
      res.status(409).json({ message: 'LINE専用アカウントを確認できません' });
      return;
    }
    // Withdrawal OAuth must use its own registered callback URI. The normal
    // /api/auth/line/callback handles login and must never receive this state.
    const withdrawalCallback = process.env.LINE_WITHDRAWAL_CALLBACK_URL?.trim() || '';
    let callbackUrl: URL;
    try { callbackUrl = new URL(withdrawalCallback); }
    catch { res.status(503).json({ message: 'LINE退会認証は準備中です' }); return; }
    const expectedOrigin = new URL(process.env.FARMPRO_ALLOWED_ORIGIN || '').origin;
    if (callbackUrl.protocol !== 'https:' || callbackUrl.origin !== expectedOrigin ||
        callbackUrl.pathname !== '/api/auth/line/withdrawal/callback' ||
        callbackUrl.search || callbackUrl.hash) {
      res.status(503).json({ message: 'LINE退会認証は準備中です' });
      return;
    }
    const withdrawalConfig = { ...config, redirectUri: callbackUrl.href };
    const browserSecret = crypto.randomBytes(32).toString('hex');
    const challenge = await issueLineWithdrawalOAuthIntent(actor, browserSecret);
    res.cookie('farmpro_line_withdrawal_oauth', browserSecret, {
      httpOnly: true, secure: true, sameSite: 'lax',
      path: '/api/auth/line/withdrawal', maxAge: 300_000,
    });
    res.json({ authorizationUrl: makeLineAuthorizationUrl(withdrawalConfig, challenge) });
  } catch {
    res.status(503).json({ message: 'LINE退会認証を開始できませんでした' });
  }
});
