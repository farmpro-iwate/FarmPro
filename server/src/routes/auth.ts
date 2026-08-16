import crypto from 'node:crypto';
import { Router } from 'express';
import {
  authenticate,
  createPasswordHash,
  createToken,
  createVerifiedUser,
  emailExists,
} from '../authStore';
import { requireAuth } from '../authMiddleware';
import { sendRegistrationVerificationEmail } from '../emailSender';
import { getActiveSubscriptionSummary } from '../stripeWebhook';
import {
  createPendingRegistration,
  verifyPendingRegistration,
} from '../registrationVerificationStore';

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

authRouter.get('/subscription', requireAuth, async (_req, res) => {
  const user = res.locals.authUser;
  const subscription = await getActiveSubscriptionSummary(user.id);
  res.json({
    plan: user.plan,
    subscription,
  });
});
