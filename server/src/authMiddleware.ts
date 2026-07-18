import { NextFunction, Request, Response } from 'express';
import { AuthUser, verifyToken } from './authStore';
import { runWithFarm } from './farmContext';

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

  const user = await verifyToken(token);
  if (!user) {
    res.status(401).json({ message: 'ログインの有効期限が切れています' });
    return;
  }

  res.locals.authUser = user;
  runWithFarm(user.farmId, next);
}
