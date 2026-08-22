import { Router } from 'express';
import { listUsersForOperator } from '../authStore';
import { requireOperator } from '../operatorAccess';

export const operatorUsersRouter = Router();

operatorUsersRouter.get('/', requireOperator, async (_req, res) => {
  try {
    const users = await listUsersForOperator();
    res.json({ users });
  } catch (error) {
    console.error('FarmPro operator user list failed', error);
    res.status(500).json({ message: '利用者一覧を取得できませんでした' });
  }
});
