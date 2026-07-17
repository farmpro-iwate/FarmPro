import { Router } from 'express';
import { authenticate, createToken } from '../authStore';
import { requireAuth } from '../authMiddleware';

export const authRouter = Router();

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
