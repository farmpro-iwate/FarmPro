import { Router, type Response } from 'express';
import { requireOperator } from '../operatorAccess';
import { cancelWithdrawalRequest, getWithdrawalRequest, listWithdrawalRequests, submitWithdrawalRequest } from '../withdrawalRequestStore';

// Mounted after requireAuth. These routes record wishes only; they never invoke
// an account deletion, subscription cancellation, plan change or email sender.
export const withdrawalRequestsRouter = Router();
withdrawalRequestsRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (!res.locals.authUser) { res.status(401).json({ message: 'ログインが必要です。' }); return; }
  next();
});
function failure(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const known: Record<string, [number, string]> = {
    WITHDRAWAL_UNAUTHORIZED: [401, '現在のアカウントを確認できません。ログイン状態を確認してください。'],
    WITHDRAWAL_OPERATOR_REQUIRED: [403, '運営者だけが受付一覧を確認できます。'],
    WITHDRAWAL_CONTACT_REQUIRED: [403, 'このアカウントからは送信できません。お問い合わせ窓口へご相談ください。'],
    WITHDRAWAL_CONFIRMATION_REQUIRED: [400, '退会希望の内容と確認チェックを確認してください。'],
    WITHDRAWAL_REQUEST_CHANGED: [409, '受付内容が変わっています。受付状況を再確認してください。'],
    WITHDRAWAL_REQUEST_EXISTS: [409, '受付済みの退会希望があります。受付状況を再確認してください。'],
    WITHDRAWAL_REQUEST_NOT_FOUND: [404, '取り消す退会希望を確認できません。受付状況を再確認してください。'],
  };
  const [status, message] = known[code] || [503, '受付結果を確認できませんでした。受付状況を再確認してください。確認できない場合はお問い合わせ窓口をご利用ください。'];
  res.status(status).json({ code: known[code] ? code : 'WITHDRAWAL_STORE_UNAVAILABLE', message,
    accountChanged: false, billingChanged: false, deleted: false });
}
withdrawalRequestsRouter.get('/me', async (_req, res) => {
  try { res.json(await getWithdrawalRequest(res.locals.authUser!)); }
  catch (error) { failure(res, error); }
});
withdrawalRequestsRouter.post('/me', async (req, res) => {
  try {
    const result = await submitWithdrawalRequest(res.locals.authUser!, req.body);
    res.status(result.alreadyRequested ? 200 : 202).json(result);
  } catch (error) { failure(res, error); }
});
withdrawalRequestsRouter.post('/me/cancel', async (req, res) => {
  try { res.json(await cancelWithdrawalRequest(res.locals.authUser!, req.body)); }
  catch (error) { failure(res, error); }
});
withdrawalRequestsRouter.get('/operator', requireOperator, async (_req, res) => {
  try { res.json(await listWithdrawalRequests(res.locals.authUser!)); }
  catch (error) { failure(res, error); }
});
