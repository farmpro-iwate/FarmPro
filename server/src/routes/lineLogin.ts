import crypto from 'node:crypto';
import { Router } from 'express';
import { getLineLoginConfig, makeLineAuthorizationUrl, exchangeAndVerifyLineCode } from '../lineLoginOAuth';
import { issueDurableLineChallenge, consumeDurableLineChallenge } from '../lineDurableChallenges';

// OAuth transport only. Do NOT issue FarmPro sessions or create/link accounts here.
// Existing email/password and verification-code routes remain untouched.
export const lineLoginRouter = Router();
const COOKIE = 'farmpro_line_oauth';
const HEX = /^[a-f0-9]{64}$/;

function readCookie(header: string | undefined) {
  const value = (header || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='));
  return value?.slice(COOKIE.length + 1) || '';
}

function clearCookie(res: import('express').Response) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/line' });
}

lineLoginRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

lineLoginRouter.get('/start', async (_req, res) => {
  try {
    const config = getLineLoginConfig();
    if (!config) { res.status(503).json({ message: 'LINEログインは現在準備中です' }); return; }
    const browserSecret = crypto.randomBytes(32).toString('hex');
    const challenge = await issueDurableLineChallenge(browserSecret);
    res.cookie(COOKIE, browserSecret, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/line', maxAge: 600_000,
    });
    res.redirect(302, makeLineAuthorizationUrl(config, challenge));
  } catch (error) {
    console.error('LINE OAuth start failed', error);
    res.status(503).json({ message: 'LINE認証を開始できませんでした' });
  }
});

lineLoginRouter.get('/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const browserSecret = readCookie(req.headers.cookie);
  clearCookie(res);
  if (!HEX.test(state) || !HEX.test(browserSecret)) {
    res.status(400).json({ message: 'LINE認証の確認情報が無効です' });
    return;
  }
  try {
    const nonce = await consumeDurableLineChallenge(state, browserSecret);
    if (!code || typeof req.query.error === 'string') {
      res.status(400).json({ message: 'LINE認証がキャンセルされました' });
      return;
    }
    const config = getLineLoginConfig();
    if (!config) { res.status(503).json({ message: 'LINEログインは現在準備中です' }); return; }
    await exchangeAndVerifyLineCode(config, code, nonce);
    // Intentionally fail closed until account-link confirmation and session issuance are built.
    res.status(501).json({ message: 'LINE認証は確認できましたが、FarmProとの連携機能は準備中です' });
  } catch (error) {
    console.error('LINE OAuth callback failed', error);
    res.status(400).json({ message: 'LINE認証を確認できませんでした' });
  }
});
