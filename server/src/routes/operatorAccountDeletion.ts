import { Router } from 'express';
import type { Response } from 'express';
import { requireOperator } from '../operatorAccess';
import { deleteOperatorFreeAccount, getOperatorDeletionPreview } from '../operatorAccountDeletionStore';
import { operatorStripeAccountReviewRouter } from './operatorStripeAccountReview';

export const operatorAccountDeletionRouter = Router();
operatorAccountDeletionRouter.use(operatorStripeAccountReviewRouter);

function failure(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'OPERATOR_REQUIRED') return res.status(403).json({ message: '運営者権限を確認できません。ログインし直してください。' });
  if (code === 'USER_NOT_FOUND') return res.status(404).json({ message: '対象の利用者が見つかりません。一覧を更新してください。' });
  if (code === 'ACCOUNT_CONFIRMATION_REQUIRED') return res.status(400).json({ message: '対象の農場・メールアドレス・削除内容を確認してください。' });
  if (code === 'ACCOUNT_CHANGED') return res.status(409).json({ message: '確認後にアカウント情報が変更されました。内容を再確認してください。削除していません。' });
  if (code === 'ACCOUNT_DELETE_BLOCKED') return res.status(409).json({ message: '契約・運営者権限・共有利用の確認が必要です。内容を再確認してください。削除していません。' });
  if (code === 'ACCOUNT_BUSY') return res.status(409).json({ message: '対象のアカウントで通信中です。作業を終えてから、内容を再確認してください。削除していません。' });
  // A marker deliberately survives an interrupted purge. Never claim rollback.
  console.error('FarmPro operator account deletion failed', code);
  return res.status(503).json({ message: '削除状態を確認できませんでした。完了扱いにはしていません。一覧を更新し「削除処理中」の場合は削除を再試行してください。契約・保存領域の確認が必要な場合は、データを書き換えず運営者が確認してください。' });
}

operatorAccountDeletionRouter.get('/:id/deletion-preview', requireOperator, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const actor = res.locals.authUser;
  if (!actor) { res.status(401).json({ message: 'ログインが必要です。' }); return; }
  try {
    res.json(await getOperatorDeletionPreview(String(req.params.id), actor.id));
  } catch (error) {
    failure(res, error);
  }
});

operatorAccountDeletionRouter.post('/:id/delete', requireOperator, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const actor = res.locals.authUser;
  if (!actor) { res.status(401).json({ message: 'ログインが必要です。' }); return; }
  try {
    const result = await deleteOperatorFreeAccount(String(req.params.id), actor.id, {
      farmId: req.body?.farmId,
      email: req.body?.email,
      revision: req.body?.revision,
      confirmed: req.body?.confirmed,
    });
    res.json({ ...result, message: 'アカウントと専用の農場保存領域を削除しました。別端末のデータや保存済みバックアップを遠隔消去したわけではありません。' });
  } catch (error) {
    failure(res, error);
  }
});
