import { Router, type Response } from 'express';
import { requireAuth } from '../authMiddleware';
import { accountWithdrawalResult, completionResult, executeAccountWithdrawal, previewAccountWithdrawal, resumeAccountWithdrawals } from '../accountWithdrawalStore';
import { requireOperator } from '../operatorAccess';
import { safeId, strictRead, runtimeRoot, withdrawalCompletions } from '../accountLifecycle';
export const accountWithdrawalsRouter = Router();
accountWithdrawalsRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
function failure(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string,string> = {
    WITHDRAWAL_PASSWORD_INVALID: '現在ログイン中のアカウントのパスワードを確認してください。',
    WITHDRAWAL_CONFIRMATION_INVALID: '退会対象と確認内容を確認してください。',
    WITHDRAWAL_CONFIRMATION_EXPIRED: '確認の有効時間が切れました。対象を再確認してください。',
    WITHDRAWAL_STATE_CHANGED: '対象や契約状態が変わりました。退会対象を再確認してください。',
    WITHDRAWAL_BLOCKED: '退会を確定できない契約状態です。対象を再確認してください。',
    WITHDRAWAL_TARGET_NOT_FOUND: '対象の利用者を確認できません。',
  };
  res.status(messages[code] ? 409 : 503).json({ message: messages[code] || '退会結果を確認できません。処理結果を再確認してください。', code });
}
// A signed confirmation can check ONLY its own receipt after login is revoked.
// This read-only endpoint never authenticates an account or starts a withdrawal.
accountWithdrawalsRouter.post('/result', async (req, res) => {
  try { res.json(await accountWithdrawalResult(req.body?.token)); } catch (error) { failure(res, error); }
});
accountWithdrawalsRouter.use(requireAuth);
accountWithdrawalsRouter.get('/operator/history', requireOperator, async (_req, res) => {
  try {
    const operations = await withdrawalCompletions();
    res.json({ total: operations.length, operations: [...operations]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id))
      .slice(0, 100).map(row => ({
        id: row.id, farmId: row.farmId,
        initiatedBy: row.actorId === row.userId ? 'self' : 'operator',
        status: row.status, startedAt: row.startedAt, completedAt: row.completedAt || null,
      })) });
  } catch (error) { failure(res, error); }
});
accountWithdrawalsRouter.get('/me/preview', async (_req, res) => {
  try { res.json(await previewAccountWithdrawal(res.locals.authUser!, res.locals.authUser!.id)); } catch (error) { failure(res, error); }
});
accountWithdrawalsRouter.get('/operator/:id/preview', requireOperator, async (req, res) => {
  try { res.json(await previewAccountWithdrawal(res.locals.authUser!, String(req.params.id))); } catch (error) { failure(res, error); }
});
const failures = new Map<string,{ count: number; until: number }>();
accountWithdrawalsRouter.post('/execute', async (req, res) => {
  const actor = res.locals.authUser!;
  const attempts = failures.get(actor.id);
  if (attempts && attempts.until > Date.now() && attempts.count >= 5) { res.status(429).json({ message: '確認の試行が多いため、10分後に再確認してください。' }); return; }
  try {
    const result = await executeAccountWithdrawal(actor, req.body); failures.delete(actor.id); res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'WITHDRAWAL_PASSWORD_INVALID') failures.set(actor.id, { count: attempts && attempts.until > Date.now() ? attempts.count + 1 : 1, until: Date.now() + 10 * 60000 });
    failure(res, error);
  }
});
accountWithdrawalsRouter.get('/operator/processing', requireOperator, async (_req, res) => {
  try {
    const root = runtimeRoot();
    const users = await strictRead(root, 'users.json');
    const requests = await strictRead(root, 'withdrawal-requests.json', true);
    if (!Array.isArray(users)) throw new Error('WITHDRAWAL_STORAGE_UNAVAILABLE');
    res.json({ operations: (await withdrawalCompletions()).filter(x => x.status === 'processing').map(x => ({
      id: x.id, farmName: users.find(user => user.id === x.userId)?.farmName || requests?.requests?.find((row: any) => row.userId === x.userId)?.farmName || '退会処理中の農場',
    })) });
  } catch (error) { failure(res, error); }
});
accountWithdrawalsRouter.post('/operator/retry-cleanup', requireOperator, async (req, res) => {
  try {
    const id = req.body?.operationId;
    if (!safeId(id) || Object.keys(req.body).some(key => key !== 'operationId')) throw new Error('WITHDRAWAL_CONFIRMATION_INVALID');
    await resumeAccountWithdrawals(id);
    const operation = (await withdrawalCompletions()).find(x => x.id === id);
    if (!operation) throw new Error('WITHDRAWAL_TARGET_NOT_FOUND');
    res.json(completionResult(operation));
  } catch (error) { failure(res, error); }
});
