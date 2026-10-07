import { NextFunction, Request, Response } from 'express';
import { AuthUser, verifyToken } from './authStore';
import { runWithFarm } from './farmContext';
import { beginAccountRequest } from './accountRequestLease';

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
    if (!user) {
      res.status(401).json({ message: 'ログインの有効期限が切れています' });
      return;
    }
    const release = await beginAccountRequest(user.farmId);
    res.once('finish', release);
    res.once('close', release);
    if (res.destroyed || res.writableEnded) { release(); return; }
    res.locals.authUser = user;
    runWithFarm(user.farmId, next);
  } catch (error) {
    if (res.headersSent) { next(error); return; }
    const code = error instanceof Error ? error.message : '';
    if (code === 'ACCOUNT_RETIRED') {
      res.status(401).json({ message: 'このアカウントは利用を終了しています。' });
      return;
    }
    console.error('FarmPro authentication store unavailable', code);
    res.status(503).json({ message: 'アカウント状態を確認できません。時間をおいて再度お試しください。' });
  }
}
