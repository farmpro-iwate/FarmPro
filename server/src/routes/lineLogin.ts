import crypto from 'node:crypto';
import { verifyBillingOAuthBinding } from '../lineBillingOAuthBinding';
import { saveLineOAuthPurpose, consumeLineOAuthPurpose } from '../lineOAuthPurposeStore';
import { issueVerifiedBillingReauthProof, consumeVerifiedBillingReauthProof } from '../lineBillingReauthProofStore';
import { inspectLineBillingEmailTarget } from '../lineBillingEmailPreflight';
import { stageLineBillingEmailCode } from '../lineBillingEmailCodeStore';
import { commitVerifiedLineBillingEmail } from '../lineBillingEmailCommit';
import { sendLineBillingEmailVerification } from '../emailSender';

import { Router } from 'express';
import { getLineLoginConfig, makeLineAuthorizationUrl, exchangeAndVerifyLineCode } from '../lineLoginOAuth';
import { issueDurableLineChallenge, consumeDurableLineChallenge } from '../lineDurableChallenges';
import { resolveLineLinkedUserId, persistVerifiedLineLink, getLineLinkStatus, getNativeLineSubjectForSession } from '../lineIdentityStore';
import { findActiveUserById, createToken, authenticate, verifyToken } from '../authStore';
import { issueLineHandoff, consumeLineHandoff } from '../lineLoginHandoff';
import { isTrustedLineOrigin } from '../lineTrustedOrigin';
import { issueLineSignupTicket } from '../lineSignupTicket';
import { validateLineFreeSignupProfile } from '../lineFreeSignup';
import { persistCanonicalLineSignupFromTicket } from '../lineCanonicalSignupStore';
import { sendRegistrationNotificationEmail } from '../emailSender';
import { beginLineWithdrawalReauth } from '../lineWithdrawalReauthBegin';
import { previewLineWithdrawal } from '../accountWithdrawalStore';

// OAuth transport only. Do NOT issue FarmPro sessions or create/link accounts here.
// Existing email/password and verification-code routes remain untouched.
export const lineLoginRouter = Router();
const COOKIE = 'farmpro_line_oauth';
const HANDOFF_COOKIE = 'farmpro_line_handoff';
const LINK_COOKIE = 'farmpro_line_link';
const SIGNUP_COOKIE = 'farmpro_line_signup';
const WITHDRAW_COOKIE = 'farmpro_line_withdraw_binding';
const BILLING_BIND_COOKIE = 'farmpro_line_billing_binding';
const BILLING_PROOF_COOKIE = 'farmpro_line_billing_proof';
const billingEnabled = () => process.env.FARMPRO_LINE_BILLING_EMAIL_ENABLED === 'true';
const billingCookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/api/auth/line' };
const lineSignupEnabled = () => process.env.FARMPRO_LINE_SIGNUP_ENABLED === 'true';
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


lineLoginRouter.get('/billing-email/availability', (_req, res) => { res.json({ available: billingEnabled() && Boolean(getLineLoginConfig()) }); });

lineLoginRouter.get('/availability', (_req, res) => {
  try {
    res.json({ available: Boolean(getLineLoginConfig()) });
  } catch {
    res.json({ available: false });
  }
});

lineLoginRouter.get('/link/status', async (req, res) => {
  const bearer = req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1] || '';
  try {
    const user = bearer ? await verifyToken(bearer) : null;
    if (!user) { res.status(401).json({ message: 'ログインが必要です' }); return; }
    res.json(await getLineLinkStatus(user.id));
  } catch {
    res.status(503).json({ message: 'LINE連携状態を確認できません' });
  }
});

lineLoginRouter.post('/link/start', async (req, res) => {
  const origin = req.get('Origin');
  if (!isTrustedLineOrigin(origin)) { res.status(403).json({ message: '接続元を確認できません' }); return; }
  const bearer = req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1] || '';
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  try {
    const config = getLineLoginConfig();
    if (!config) { res.status(503).json({ message: 'LINE連携は現在準備中です' }); return; }
    const [sessionUser, passwordUser] = await Promise.all([verifyToken(bearer), authenticate(email, password)]);
    if (!sessionUser || !passwordUser || sessionUser.id !== passwordUser.id ||
        sessionUser.farmId !== passwordUser.farmId) {
      res.status(401).json({ message: '現在のログイン利用者とパスワードを確認してください' });
      return;
    }
    const browserSecret = crypto.randomBytes(32).toString('hex');
    const challenge = await issueDurableLineChallenge(browserSecret);
    const issuedAt = Date.now();
    const payload = [sessionUser.id, challenge.state, issuedAt].join('.');
    const secret = process.env.FARMPRO_AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET_REQUIRED');
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    res.cookie(COOKIE, browserSecret, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/line', maxAge: 600_000 });
    res.cookie(LINK_COOKIE, payload + '.' + signature, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/line', maxAge: 600_000 });
    res.json({ authorizationUrl: makeLineAuthorizationUrl(config, challenge) });
  } catch {
    res.status(503).json({ message: 'LINE連携を開始できませんでした' });
  }
});

// Disabled until the withdrawal-specific OAuth callback and confirmation are wired.
// This endpoint never creates a proof or changes account data.
lineLoginRouter.post('/withdrawal/reauth/start', async (req, res) => {
  if (process.env.FARMPRO_LINE_WITHDRAWAL_ENABLED !== 'true') {
    res.status(503).json({ message: 'LINE退会は現在準備中です' }); return;
  }
  if (!isTrustedLineOrigin(req.get('Origin'))) {
    res.status(403).json({ message: '接続元を確認できません' }); return;
  }
  const bearer = req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1] || '';
  try {
    const user = bearer ? await verifyToken(bearer) : null;
    if (!user || (user as typeof user & {loginMethod?: string}).loginMethod !== 'line') {
      res.status(403).json({ message: 'LINE専用アカウントでログインしてください' }); return;
    }
    const eligibility = await previewLineWithdrawal(user);
    if (!eligibility.eligible) { res.status(409).json({ message: eligibility.reason || '退会条件を確認できません' }); return; }
    const config = getLineLoginConfig();
    if (!config) { res.status(503).json({ message: 'LINE認証を開始できません' }); return; }
    const browserSecret = crypto.randomBytes(32).toString('hex');
    const authorizationUrl = await beginLineWithdrawalReauth(config, browserSecret, {
      id: user.id, farmId: user.farmId, active: true,
    });
    res.cookie(COOKIE, browserSecret, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/line', maxAge: 600_000,
    });
    // Bind the reauthentication to this account and OAuth state in an HttpOnly cookie.
    const oauthState = new URL(authorizationUrl).searchParams.get('state');
    const key = process.env.FARMPRO_AUTH_SECRET;
    if (!oauthState || !key) throw new Error('WITHDRAWAL_BINDING_UNAVAILABLE');
    const payload = [user.id, user.farmId, oauthState, Date.now()].join('.');
    const mac = crypto.createHmac('sha256', key).update(payload).digest('hex');
    res.cookie(WITHDRAW_COOKIE, payload + '.' + mac, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/line', maxAge: 600_000,
    });
    // The callback must require a fresh, verified session binding before it
    // can issue a one-use proof. Never accept an arbitrary user ID from URL.
    res.json({ authorizationUrl });
  } catch {
    res.status(503).json({ message: 'LINE退会の本人確認を開始できません' });
  }
});


// Disabled by default; billing email enrollment never unlocks checkout.
lineLoginRouter.post('/billing-email/reauth/start', async (req, res) => {
  if (!billingEnabled()) { res.status(503).json({message:'請求先メール登録は準備中です'}); return; }
  if (!isTrustedLineOrigin(req.get('Origin'))) { res.sendStatus(403); return; }
  try {
    const token = req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1] || '';
    const user = token ? await verifyToken(token) : null;
    const actor = user as (typeof user & {loginMethod?:string;lineSubject?:string}) | null;
    const subject = actor ? await getNativeLineSubjectForSession(actor.id,actor.farmId) : null;
    if (!actor || actor.loginMethod !== 'line' || !subject || actor.role !== 'owner' || actor.email) { res.sendStatus(403); return; }
    await inspectLineBillingEmailTarget({userId:actor.id,farmId:actor.farmId,lineSubject:subject},'placeholder@example.invalid');
    const config=getLineLoginConfig();
    if (!config) { res.sendStatus(503); return; }
    const browserSecret=crypto.randomBytes(32).toString('hex');
    const challenge=await issueDurableLineChallenge(browserSecret);
    await saveLineOAuthPurpose(challenge.state,{purpose:'billing-email-reauth',userId:actor.id,farmId:actor.farmId});
    const payload=[actor.id,actor.farmId,challenge.state,Date.now()].join('.');
    const key=process.env.FARMPRO_AUTH_SECRET;
    if (!key) throw new Error('AUTH_SECRET_REQUIRED');
    const signature=crypto.createHmac('sha256',key).update(payload).digest('hex');
    res.cookie(COOKIE,browserSecret,{...billingCookieOptions,maxAge:600000});
    res.cookie(BILLING_BIND_COOKIE,payload+'.'+signature,{...billingCookieOptions,maxAge:600000});
    res.json({authorizationUrl:makeLineAuthorizationUrl(config,challenge)});
  } catch { res.status(503).json({message:'LINE本人確認を開始できませんでした'}); }
});
lineLoginRouter.post('/billing-email/code/start',async(req,res)=>{
  if (!billingEnabled()) {res.sendStatus(503);return;}
  if (!isTrustedLineOrigin(req.get('Origin'))) {res.sendStatus(403);return;}
  const secret=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(BILLING_PROOF_COOKIE+'='))?.slice(BILLING_PROOF_COOKIE.length+1)||'';
  let stage = 'session';
  try {
    const token=req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]||'';
    const actor=token ? await verifyToken(token) as (Awaited<ReturnType<typeof verifyToken>> & {loginMethod?:string;lineSubject?:string}) : null;
    const subject=actor ? await getNativeLineSubjectForSession(actor.id,actor.farmId) : null;
    if(!actor || actor.loginMethod!=='line' || !subject || actor.role!=='owner') {res.sendStatus(403);return;}
    const identity={userId:actor.id,farmId:actor.farmId,lineSubject:subject};
    const email=typeof req.body?.email==='string'?req.body.email:'';
    stage = 'eligibility';
    await inspectLineBillingEmailTarget(identity,email);
    stage = 'proof';
    await consumeVerifiedBillingReauthProof(secret,identity);
    res.clearCookie(BILLING_PROOF_COOKIE,billingCookieOptions);
    stage = 'challenge';
    const issued=await stageLineBillingEmailCode(identity,email);
    stage = 'delivery';
    await sendLineBillingEmailVerification(email.trim().toLowerCase(),issued.code);
    res.status(202).json({verificationRequired:true});
  } catch (error) {
    // Never log addresses, verification codes, tokens, cookies or provider error details.
    if (stage === 'delivery') {
      const message = error instanceof Error ? error.message : '';
      const category = message === 'RESEND_API_KEY_REQUIRED' ? 'api-key-missing'
        : message === 'FARMPRO_EMAIL_FROM_REQUIRED' ? 'sender-missing'
        : /^EMAIL_SEND_FAILED:4[0-9]{2}$/.test(message) ? 'provider-4xx'
        : /^EMAIL_SEND_FAILED:5[0-9]{2}$/.test(message) ? 'provider-5xx'
        : message.startsWith('EMAIL_SEND_FAILED:') ? 'provider-rejected'
        : 'network-or-unknown';
      // Only a fixed error category is logged. Do not log the provider's response,
      // email addresses, secrets, tokens or verification codes.
      console.error('LINE billing email delivery failure category:', category);
    } else {
      console.error('LINE billing email enrollment failed at stage:', stage);
    }
    const status = stage === 'delivery' ? 502 : stage === 'proof' ? 403 : 400;
    res.status(status).json({message: stage === 'delivery'
      ? '確認メールを送信できませんでした。運営者にお問い合わせください。'
      : 'メール登録を完了できませんでした。再度LINE本人確認からお試しください。'});
  }
});
lineLoginRouter.post('/billing-email/code/verify',async(req,res)=>{
  if(!billingEnabled()){res.sendStatus(503);return;}
  if(!isTrustedLineOrigin(req.get('Origin'))){res.sendStatus(403);return;}
  try {
    const token=req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]||'';
    const actor=token ? await verifyToken(token) as (Awaited<ReturnType<typeof verifyToken>> & {loginMethod?:string;lineSubject?:string}) : null;
    const subject=actor ? await getNativeLineSubjectForSession(actor.id,actor.farmId) : null;
    if(!actor||actor.loginMethod!=='line'||!subject||actor.role!=='owner'){res.sendStatus(403);return;}
    const code=typeof req.body?.code==='string'?req.body.code:'';
    const result=await commitVerifiedLineBillingEmail({userId:actor.id,farmId:actor.farmId,lineSubject:subject},code);
    res.json({verified:true,email:result.email});
  } catch {res.status(400).json({message:'確認コードを確認できませんでした。期限や入力内容をご確認ください'});}
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
  const billingCookie = (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(BILLING_BIND_COOKIE+'='))?.slice(BILLING_BIND_COOKIE.length+1)||'';
  res.clearCookie(BILLING_BIND_COOKIE,billingCookieOptions);
  const linkCookie = (req.headers.cookie || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(LINK_COOKIE + '='))?.slice(LINK_COOKIE.length + 1) || '';
  clearCookie(res);
  res.clearCookie(LINK_COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/line' });
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
    const identity = await exchangeAndVerifyLineCode(config, code, nonce);

    if (billingCookie) {
      if (!billingEnabled()) { res.sendStatus(403); return; }
      const { userId, farmId } = verifyBillingOAuthBinding(billingCookie, state, process.env.FARMPRO_AUTH_SECRET || '');
      await consumeLineOAuthPurpose(state,{purpose:'billing-email-reauth',userId,farmId});
      const account=await findActiveUserById(userId) as (Awaited<ReturnType<typeof findActiveUserById>> & {loginMethod?:string;lineSubject?:string}) | null;
      if(!account || account.farmId!==farmId || (account as typeof account & {loginMethod?: string}).loginMethod!== 'line' || (await getNativeLineSubjectForSession(userId,farmId))!==identity.subject || account.email){res.sendStatus(403);return;}
      const proof=await issueVerifiedBillingReauthProof({userId,farmId,lineSubject:identity.subject});
      res.cookie(BILLING_PROOF_COOKIE,proof,{...billingCookieOptions,maxAge:300000});
      res.redirect(303,'/settings?billingReauth=1');return;
    }
    if (linkCookie) {
      const [userId, savedState, issuedString, signature] = linkCookie.split('.');
      const secret = process.env.FARMPRO_AUTH_SECRET || '';
      const payload = [userId, savedState, issuedString].join('.');
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      if (!secret || !HEX.test(signature || '') ||
          !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex')) ||
          savedState !== state || !/^[0-9]+$/.test(issuedString || '') ||
          Date.now() - Number(issuedString) > 600_000 || Number(issuedString) > Date.now()) {
        res.status(403).json({ message: 'LINE連携の本人確認が無効です' });
        return;
      }
      const user = await findActiveUserById(userId);
      if (!user) { res.status(403).json({ message: '連携対象の利用者を確認できません' }); return; }
      await persistVerifiedLineLink(identity.subject, user.id);
      res.redirect(303, '/settings?lineLinked=1');
      return;
    }
    const userId = await resolveLineLinkedUserId(identity.subject);
    if (!userId) {
      if (!lineSignupEnabled()) { res.status(409).json({ message: 'LINE新規登録は準備中です。既存の登録方法をご利用ください' }); return; }
      // Server-verified identity may proceed to explicit Free signup; no automatic account creation.
      res.cookie(SIGNUP_COOKIE, issueLineSignupTicket(identity.subject), {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/line', maxAge: 300000,
      });
      res.redirect(303, '/line-signup');
      return;
    }
    const user = await findActiveUserById(userId);
    if (!user) { res.status(403).json({ message: '利用可能なアカウントを確認できませんでした' }); return; }
    const ticket = await issueLineHandoff(user.id);
    res.cookie(HANDOFF_COOKIE, ticket, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth/line', maxAge: 60000 });
    res.redirect(303, '/line-login/complete');
  } catch (error) {
    console.error('LINE OAuth callback failed', error);
    res.status(400).json({ message: 'LINE認証を確認できませんでした' });
  }
});

lineLoginRouter.post('/finish', async (req, res) => {
  // Prevent cross-origin form posts from consuming the browser's login ticket.
  const origin = req.get('Origin');
  if (!isTrustedLineOrigin(origin)) {
    res.status(403).json({ message: 'ログイン元を確認できません' });
    return;
  }
  const cookie = (req.headers.cookie || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(HANDOFF_COOKIE + '='));
  const secret = cookie?.slice(HANDOFF_COOKIE.length + 1) || '';
  res.clearCookie(HANDOFF_COOKIE, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth/line' });
  if (!HEX.test(secret)) { res.status(401).json({ message: 'LINEログインをやり直してください' }); return; }
  try {
    const userId = await consumeLineHandoff(secret);
    const user = await findActiveUserById(userId);
    if (!user) { res.status(403).json({ message: 'アカウントが無効です' }); return; }
    res.json({ token: createToken(user), user });
  } catch {
    res.status(401).json({ message: 'LINEログインの有効期限が切れました' });
  }
});

// Only an OAuth-verified browser may explicitly create a Free account.
lineLoginRouter.post('/signup/complete', async (req, res) => {
  if (!lineSignupEnabled()) { res.status(503).json({ message: 'LINE新規登録は準備中です' }); return; }
  if (!isTrustedLineOrigin(req.get('Origin'))) {
    res.status(403).json({ message: '接続元を確認できません' }); return;
  }
  const cookie = (req.headers.cookie || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(SIGNUP_COOKIE + '='));
  const ticket = cookie?.slice(SIGNUP_COOKIE.length + 1) || '';
  if (!ticket) { res.status(401).json({ message: 'LINE認証からやり直してください' }); return; }
  try {
    const profile = validateLineFreeSignupProfile(req.body);
    const user = { id: crypto.randomUUID(), farmId: crypto.randomUUID(),
      ...profile, active: true as const, loginMethod: 'line' as const };
    await persistCanonicalLineSignupFromTicket(ticket, user);
    res.clearCookie(SIGNUP_COOKIE, { httpOnly:true, secure:true, sameSite:'lax', path:'/api/auth/line' });
    const account = await findActiveUserById(user.id);
    if (!account) throw new Error('LINE_SIGNUP_USER_UNAVAILABLE');
    try {
      await sendRegistrationNotificationEmail({farmName:account.farmName,name:account.name,
        registrationMethod:'line',registeredAt:new Date().toISOString()});
    } catch (notificationError) {
      console.error('LINE registration operator notification failed', notificationError);
    }
    res.status(201).json({token:createToken(account),user:account});
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const conflict = code === 'LINE_SIGNUP_ALREADY_EXISTS';
    res.status(conflict ? 409 : 400).json({ message: conflict ? 'このLINEアカウントは登録済みです。ログインしてください' : 'LINE新規登録を完了できませんでした', code: conflict ? code : 'LINE_SIGNUP_FAILED' });
  }
});
