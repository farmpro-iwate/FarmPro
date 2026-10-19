import crypto from 'node:crypto';
import { Router } from 'express';
import { isTrustedLineOrigin } from '../lineTrustedOrigin';
import { validateLineFreeSignupProfile } from '../lineFreeSignup';
import { persistCanonicalLineSignupFromTicket } from '../lineCanonicalSignupStore';

export const linePreviewSignupRouter = Router();
const COOKIE = 'farmpro_line_signup';
linePreviewSignupRouter.post('/signup/complete', async (req, res) => {
  if (process.env.FARMPRO_LINE_ISOLATED_PREVIEW !== 'true' && process.env.FARMPRO_LINE_FULL_APP_PREVIEW !== 'true' && process.env.FARMPRO_LINE_SIGNUP_PRODUCTION !== 'true') {
    res.status(404).json({ message: '利用できません' }); return;
  }
  if (!isTrustedLineOrigin(req.get('Origin'))) {
    res.status(403).json({ message: '接続元を確認できません' }); return;
  }
  const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='));
  const ticket = cookie?.slice(COOKIE.length + 1) || '';
  if (!ticket) { res.status(401).json({ message: 'LINE認証からやり直してください' }); return; }
  try {
    const profile = validateLineFreeSignupProfile(req.body);
    await persistCanonicalLineSignupFromTicket(ticket, {
      id: crypto.randomUUID(), farmId: crypto.randomUUID(),
      ...profile, loginMethod: 'line', active: true,
    });
    res.clearCookie(COOKIE, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth/line' });
    res.status(201).json({ registered: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'LINE_SIGNUP_ALREADY_EXISTS') {
      res.status(409).json({ message: 'このLINEアカウントは登録済みです' }); return;
    }
    if (code.startsWith('LINE_SIGNUP_INVALID') || code === 'LINE_SIGNUP_CONFIRMATION_REQUIRED') {
      res.status(400).json({ message: '登録内容を確認してください' }); return;
    }
    res.status(401).json({ message: '登録を完了できませんでした。LINE認証からやり直してください' });
  }
});
