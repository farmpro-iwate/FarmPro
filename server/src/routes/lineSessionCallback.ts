import { Router } from 'express';
import { getLineLoginConfig, exchangeAndVerifyLineCode } from '../lineLoginOAuth';
import { consumeDurableLineChallenge } from '../lineDurableChallenges';
import { issueVerifiedLineLoginHandoff } from '../lineLoginSessionBridge';
import { issueLineSignupTicket } from '../lineSignupTicket';

/** Staging-only callback, intentionally not mounted in app.ts. */
export const lineSessionCallbackRouter = Router();
lineSessionCallbackRouter.get('/callback', async (req, res) => {
  const cookie = (req.headers.cookie || '').split(';').map(v => v.trim())
    .find(v => v.startsWith('farmpro_line_oauth='));
  const browserSecret = cookie?.slice('farmpro_line_oauth='.length) || '';
  res.clearCookie('farmpro_line_oauth', {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/line',
  });
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browserSecret)) {
    res.status(400).json({ message: 'LINE認証の確認情報が無効です' });
    return;
  }
  let stage = 'challenge';
  try {
    // Consume challenge before accepting an OAuth code (replay prevention).
    const nonce = await consumeDurableLineChallenge(state, browserSecret);
    if (!code || typeof req.query.error === 'string') {
      res.status(400).json({ message: 'LINE認証がキャンセルされました' });
      return;
    }
    const config = getLineLoginConfig();
    if (!config) { res.status(503).json({ message: 'LINEログインは準備中です' }); return; }
    stage = 'token-verification';
    const verified = await exchangeAndVerifyLineCode(config, code, nonce);
    let ticket: string;
    try {
      stage = 'account-lookup';
      ticket = await issueVerifiedLineLoginHandoff(verified);
    } catch (error) {
      if ((process.env.FARMPRO_LINE_ISOLATED_PREVIEW !== 'true' &&
           process.env.FARMPRO_LINE_FULL_APP_PREVIEW !== 'true') ||
          !(error instanceof Error) || error.message !== 'LINE_ACCOUNT_NOT_FOUND') throw error;
      stage = 'signup-ticket';
      res.cookie('farmpro_line_signup', issueLineSignupTicket(verified.subject), {
        httpOnly: true, secure: true, sameSite: 'strict',
        path: '/api/auth/line', maxAge: 300_000,
      });
      res.redirect(302, '/line/signup');
      return;
    }
    res.cookie('farmpro_line_handoff', ticket, {
      httpOnly: true, secure: true, sameSite: 'strict',
      path: '/api/auth/line', maxAge: 60_000,
    });
    // Keep the isolated preview verification page unchanged; full FarmPro uses /login.
    const completionPath = process.env.FARMPRO_LINE_ISOLATED_PREVIEW === 'true'
      ? '/login/email?line=complete'
      : '/login?line=complete';
    res.redirect(302, completionPath);
  } catch (error) {
    if (process.env.FARMPRO_LINE_FULL_APP_PREVIEW === 'true') {
      const code = error instanceof Error && /^LINE_[A-Z0-9_]+$/.test(error.message)
        ? error.message : 'UNCLASSIFIED';
      console.error('LINE full-app callback failure', { stage, code });
    }
    res.status(401).json({ message: 'LINE認証を完了できませんでした' });
  }
});
