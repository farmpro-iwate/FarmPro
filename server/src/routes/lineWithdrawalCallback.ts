import { Router } from 'express';
import { findActiveUserById } from '../authStore';
import { getLineLoginConfig, exchangeAndVerifyLineCode } from '../lineLoginOAuth';
import { consumeLineWithdrawalOAuthCallback } from '../lineWithdrawalOAuthIntent';
import { assertNativeLineWithdrawalIdentity } from '../lineWithdrawalIdentity';
import { issueLineWithdrawalConfirmation } from '../lineWithdrawalConfirmation';

/** Unmounted preview-only callback: does NOT perform withdrawal or deletion. */
export const lineWithdrawalCallbackRouter = Router();
lineWithdrawalCallbackRouter.get('/callback', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.clearCookie('farmpro_line_withdrawal_oauth', {
    httpOnly:true, secure:true, sameSite:'lax', path:'/api/auth/line/withdrawal',
  });
  if (process.env.FARMPRO_LINE_FULL_APP_PREVIEW !== 'true') {
    res.status(403).json({message:'LINE退会認証は使用できません'});
    return;
  }
  const state=typeof req.query.state==='string'?req.query.state:'';
  const code=typeof req.query.code==='string'?req.query.code:'';
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('farmpro_line_withdrawal_oauth='));
  const browserSecret=cookie?.slice('farmpro_line_withdrawal_oauth='.length)||'';
  if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browserSecret)) {
    res.status(401).json({message:'LINE退会認証をやり直してください'});
    return;
  }
  try {
    const {nonce,actor}=await consumeLineWithdrawalOAuthCallback(state,browserSecret);
    if (!code || typeof req.query.error==='string') throw new Error('LINE_WITHDRAWAL_CANCELLED');
    const config=getLineLoginConfig();
    const callback=process.env.LINE_WITHDRAWAL_CALLBACK_URL?.trim()||'';
    if (!config || callback!==new URL('/api/auth/line/withdrawal/callback',process.env.FARMPRO_ALLOWED_ORIGIN).href)
      throw new Error('LINE_WITHDRAWAL_CONFIG_INVALID');
    const identity=await exchangeAndVerifyLineCode({...config,redirectUri:callback},code,nonce);
    const currentUser = await findActiveUserById(actor.id);
    if (!currentUser || currentUser.farmId !== actor.farmId || !currentUser.active) throw new Error('LINE_WITHDRAWAL_ACCOUNT_CHANGED');
    await assertNativeLineWithdrawalIdentity(actor,actor,identity);
    const confirmation=await issueLineWithdrawalConfirmation(actor.id,actor.farmId);
    // Private HttpOnly ticket; never place proof in URL or JSON.
    res.cookie('farmpro_line_withdrawal_confirmation',confirmation,{
      httpOnly:true,secure:true,sameSite:'strict',path:'/api/auth/line/withdrawal',maxAge:120_000,
    });
    // This callback does not enable deletion or a destructive action.
    res.redirect(302,'/settings?lineWithdrawal=verified');
  } catch {
    res.status(401).json({message:'LINE退会認証を完了できませんでした'});
  }
});
