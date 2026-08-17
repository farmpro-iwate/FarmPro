import crypto from 'node:crypto';
import { Router } from 'express';
import {
  authenticate,
  createPasswordHash,
  createToken,
  createVerifiedUser,
  emailExists,
  updateUserEmailById,
  updateUserPasswordById,
  updateUserProfileById,
} from '../authStore';
import { requireAuth } from '../authMiddleware';
import { sendEmailChangeVerificationEmail, sendRegistrationVerificationEmail } from '../emailSender';
import { getActiveSubscriptionSummary } from '../stripeWebhook';
import {
  createPendingRegistration,
  verifyPendingRegistration,
} from '../registrationVerificationStore';
import {
  createPendingEmailChange,
  verifyPendingEmailChange,
} from '../emailChangeVerificationStore';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const farmName = typeof req.body?.farmName === 'string' ? req.body.farmName.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!farmName || !name || !email || !password) {
    res.status(400).json({ message: '農場名・お名前・メールアドレス・パスワードを入力してください' });
    return;
  }

  try {
    if (await emailExists(email)) {
      res.status(409).json({ message: 'このメールアドレスはすでに登録されています' });
      return;
    }

    const credentials = createPasswordHash(password);
    const { code } = await createPendingRegistration({
      farmId: `farm-${crypto.randomUUID()}`,
      farmName,
      name,
      email,
      ...credentials,
    });

    await sendRegistrationVerificationEmail(email, code);
    res.status(202).json({ email, verificationRequired: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PASSWORD_TOO_SHORT') {
      res.status(400).json({ message: 'パスワードは8文字以上で入力してください' });
      return;
    }
    if (code === 'INVALID_EMAIL') {
      res.status(400).json({ message: 'メールアドレスの形式を確認してください' });
      return;
    }
    if (code.startsWith('EMAIL_SEND_FAILED') || code === 'RESEND_API_KEY_REQUIRED' || code === 'FARMPRO_EMAIL_FROM_REQUIRED') {
      console.error('FarmPro verification email failed', error);
      res.status(503).json({ message: '確認メールを送信できませんでした。時間をおいてもう一度お試しください' });
      return;
    }
    console.error('FarmPro registration failed', error);
    res.status(500).json({ message: '利用登録を開始できませんでした' });
  }
});

authRouter.post('/register/verify', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';

  if (!email || !/^\d{6}$/.test(code)) {
    res.status(400).json({ message: 'メールアドレスと6桁の確認コードを入力してください' });
    return;
  }

  try {
    if (await emailExists(email)) {
      res.status(409).json({ message: 'このメールアドレスはすでに登録されています' });
      return;
    }

    const pending = await verifyPendingRegistration(email, code);
    const user = await createVerifiedUser({
      farmId: pending.farmId,
      farmName: pending.farmName,
      name: pending.name,
      email: pending.email,
      passwordSalt: pending.passwordSalt,
      passwordHash: pending.passwordHash,
      role: 'owner',
      plan: 'free',
    });

    res.status(201).json({ token: createToken(user), user });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : '';
    if (errorCode === 'INVALID_VERIFICATION_CODE') {
      res.status(400).json({ message: '確認コードが違います' });
      return;
    }
    if (errorCode === 'VERIFICATION_NOT_FOUND') {
      res.status(410).json({ message: '確認コードの有効期限が切れています。もう一度利用登録してください' });
      return;
    }
    if (errorCode === 'VERIFICATION_LOCKED') {
      res.status(429).json({ message: '確認コードの入力回数を超えました。もう一度利用登録してください' });
      return;
    }
    console.error('FarmPro registration verification failed', error);
    res.status(500).json({ message: 'メールアドレスを確認できませんでした' });
  }
});

authRouter.post('/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ message: 'メールアドレスとパスワードを入力してください' });
    return;
  }

  const user = await authenticate(email, password);
  if (!user) {
    res.status(401).json({ message: 'メールアドレスまたはパスワードが違います' });
    return;
  }

  res.json({ token: createToken(user), user });
});

authRouter.get('/me', requireAuth, (_req, res) => {
  res.json({ user: res.locals.authUser });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  const farmName = typeof req.body?.farmName === 'string' ? req.body.farmName.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!farmName || !name) {
    res.status(400).json({ message: '農場名と代表者名を入力してください' });
    return;
  }

  try {
    const updatedUser = await updateUserProfileById(user.id, { farmName, name });
    res.json({ user: updatedUser });
  } catch (error) {
    console.error('FarmPro profile update failed', error);
    res.status(500).json({ message: 'アカウント情報を更新できませんでした' });
  }
});

authRouter.post('/email-change/start', requireAuth, async (req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  if (!email || !currentPassword) {
    res.status(400).json({ message: '新しいメールアドレスと現在のパスワードを入力してください' });
    return;
  }

  try {
    const authenticated = await authenticate(user.email, currentPassword);
    if (!authenticated) {
      res.status(401).json({ message: '現在のパスワードが違います' });
      return;
    }
    if (email === user.email.toLowerCase()) {
      res.status(400).json({ message: '現在と同じメールアドレスです' });
      return;
    }
    if (await emailExists(email)) {
      res.status(409).json({ message: 'このメールアドレスはすでに登録されています' });
      return;
    }

    const { code } = await createPendingEmailChange(user.id, email);
    await sendEmailChangeVerificationEmail(email, code);
    res.status(202).json({ email, verificationRequired: true });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : '';
    if (errorCode === 'INVALID_EMAIL') {
      res.status(400).json({ message: 'メールアドレスの形式を確認してください' });
      return;
    }
    if (errorCode.startsWith('EMAIL_SEND_FAILED') || errorCode === 'RESEND_API_KEY_REQUIRED' || errorCode === 'FARMPRO_EMAIL_FROM_REQUIRED') {
      console.error('FarmPro email change verification failed', error);
      res.status(503).json({ message: '確認メールを送信できませんでした。時間をおいてもう一度お試しください' });
      return;
    }
    console.error('FarmPro email change start failed', error);
    res.status(500).json({ message: 'メールアドレス変更を開始できませんでした' });
  }
});

authRouter.post('/email-change/verify', requireAuth, async (req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ message: '6桁の確認コードを入力してください' });
    return;
  }

  try {
    const pending = await verifyPendingEmailChange(user.id, code);
    if (await emailExists(pending.email)) {
      res.status(409).json({ message: 'このメールアドレスはすでに登録されています' });
      return;
    }
    const updatedUser = await updateUserEmailById(user.id, pending.email);
    res.json({ user: updatedUser });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : '';
    if (errorCode === 'INVALID_VERIFICATION_CODE') {
      res.status(400).json({ message: '確認コードが違います' });
      return;
    }
    if (errorCode === 'VERIFICATION_NOT_FOUND') {
      res.status(410).json({ message: '確認コードの有効期限が切れています。もう一度変更手続きをしてください' });
      return;
    }
    if (errorCode === 'VERIFICATION_LOCKED') {
      res.status(429).json({ message: '確認コードの入力回数を超えました。もう一度変更手続きをしてください' });
      return;
    }
    console.error('FarmPro email change verification failed', error);
    res.status(500).json({ message: 'メールアドレスを変更できませんでした' });
  }
});

authRouter.post('/password-change', requireAuth, async (req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!currentPassword || !newPassword) {
    res.status(400).json({ message: '現在のパスワードと新しいパスワードを入力してください' });
    return;
  }

  try {
    const authenticated = await authenticate(user.email, currentPassword);
    if (!authenticated) {
      res.status(401).json({ message: '現在のパスワードが違います' });
      return;
    }
    await updateUserPasswordById(user.id, newPassword);
    res.status(204).end();
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : '';
    if (errorCode === 'PASSWORD_TOO_SHORT') {
      res.status(400).json({ message: '新しいパスワードは8文字以上で入力してください' });
      return;
    }
    console.error('FarmPro password change failed', error);
    res.status(500).json({ message: 'パスワードを変更できませんでした' });
  }
});

authRouter.get('/subscription', requireAuth, async (_req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }
  const subscription = await getActiveSubscriptionSummary(user.id);
  res.json({
    plan: user.plan,
    subscription,
  });
});
