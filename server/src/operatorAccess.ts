import type { NextFunction, Request, Response } from 'express';

function configuredOperatorEmails() {
  return (process.env.FARMPRO_OPERATOR_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function requireOperator(_req: Request, res: Response, next: NextFunction) {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  const allowedEmails = configuredOperatorEmails();
  if (allowedEmails.length === 0) {
    res.status(503).json({ message: '運営者権限が設定されていません' });
    return;
  }

  if (!allowedEmails.includes(user.email.trim().toLowerCase())) {
    res.status(403).json({ message: 'このページを利用する権限がありません' });
    return;
  }

  next();
}
