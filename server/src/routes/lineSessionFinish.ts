import { Router } from 'express';
import { isTrustedLineOrigin } from '../lineTrustedOrigin';
import { finishLineLoginSession } from '../lineLoginSessionFinish';

/**
 * Isolated LINE login completion endpoint. Deliberately NOT mounted in app.ts:
 * OAuth callback/browser cookie binding must be integrated and reviewed first.
 * The handoff secret is accepted ONLY from an HttpOnly cookie, never request body.
 */
export const lineSessionFinishRouter = Router();
const COOKIE = 'farmpro_line_handoff';
lineSessionFinishRouter.post('/finish', async (req, res) => {
  if (!isTrustedLineOrigin(req.get('Origin'))) {
    res.status(403).json({ message: 'ログイン元を確認できません' });
    return;
  }
  const found = (req.headers.cookie || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(COOKIE + '='));
  const ticket = found?.slice(COOKIE.length + 1) || '';
  res.clearCookie(COOKIE, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth/line' });
  if (!/^[a-f0-9]{64}$/.test(ticket)) {
    res.status(401).json({ message: 'LINEログインをやり直してください' });
    return;
  }
  try {
    res.json(await finishLineLoginSession(ticket));
  } catch {
    res.status(401).json({ message: 'LINEログインの有効期限が切れました' });
  }
});
