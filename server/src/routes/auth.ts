import crypto from 'node:crypto';
import { Router } from 'express';
import { authenticate, createToken, createUser } from '../authStore';
import { requireAuth } from '../authMiddleware';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const farmName = typeof req.body?.farmName === 'string' ? req.body.farmName.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!farmName || !name || !email || !password) {
    res.status(400).json({ message: '農場名・お名前・メールアドレス・パスワードを入力してください' });
    return;
  }

  try {
    const user = await createUser({
      farmId: `farm-${crypto.randomUUID()}`,
      farmName,
      name,
      email,
      password,
      role: 'owner',
      plan: 'free',
    });

    res.status(201).json({ token: createToken(user), user });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'EMAIL_ALREADY_EXISTS') {
      res.status(409).json({ message: 'このメールアドレスはすでに登録されています' });
      return;
    }
    if (code === 'PASSWORD_TOO_SHORT') {
      res.status(400).json({ message: 'パスワードは8文字以上で入力してください' });
      return;
    }
    if (code === 'INVALID_EMAIL') {
      res.status(400).json({ message: 'メールアドレスの形式を確認してください' });
      return;
    }
    console.error('FarmPro registration failed', error);
    res.status(500).json({ message: '利用登録に失敗しました' });
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
