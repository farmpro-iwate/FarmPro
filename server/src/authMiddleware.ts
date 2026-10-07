import { NextFunction, Request, Response } from 'express';
import { AuthUser, verifyToken } from './authStore';
import { runWithFarm } from './farmContext';
import { withFarmRequest } from './farmRequestGate';

declare global {
  namespace Express {
    interface Locals {
      authUser?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  try {
    const user = await verifyToken(token);
    if (!user) { res.status(401).json({ message: 'ログインの有効期限が切れています' }); return; }
    await withFarmRequest(user.farmId, async () => {
      // A withdrawal may have completed while this request was waiting.
      const current = await verifyToken(token);
      if (!current) { res.status(401).json({ message: 'ログインの有効期限が切れています' }); return; }
      res.locals.authUser = current;
      await new Promise<void>(resolve => {
        res.once('finish', resolve); res.once('close', resolve);
        runWithFarm(current.farmId, next);
      });
    });
  } catch {
    if (!res.headersSent) res.status(503).json({ message: 'アカウント状態を確認できません。しばらくして再確認してください。' });
  }
}
