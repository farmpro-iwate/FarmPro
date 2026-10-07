import { Router } from 'express';
import type { Response } from 'express';
import { requireOperator } from '../operatorAccess';
import { assessOperatorDeletionRequest, getPublicOperatorDeletionPreview } from '../operatorAccountDeletionGate';
import { operatorStripeAccountReviewRouter } from './operatorStripeAccountReview';

export const operatorAccountDeletionRouter = Router();
operatorAccountDeletionRouter.use(operatorStripeAccountReviewRouter);

function failure(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const send = (status: number, publicCode: string, message: string) =>
    res.status(status).json({ deleted: false, canDelete: false, code: publicCode, message });
  if (code === 'OPERATOR_REQUIRED') return send(403, code, '運営者権限を確認できません。ログインし直してください。');
  if (code === 'USER_NOT_FOUND') return send(404, code, '対象の利用者が見つかりません。一覧を更新してください。');
  if (code === 'ACCOUNT_CONFIRMATION_REQUIRED') return send(400, code, '対象の農場・メールアドレス・削除内容を確認してください。');
  if (code === 'ACCOUNT_CHANGED') return send(409, code, '確認後にアカウント情報が変更されました。内容を再確認してください。この要求では削除していません。');
  if (code === 'ACCOUNT_DELETE_BLOCKED') return send(409, code, '契約・運営者権限・共有利用の確認が必要です。内容を再確認してください。この要求では削除していません。');
  if (code === 'ACCOUNT_BUSY') return send(409, code, '対象のアカウントで通信中です。作業を終えてから、内容を再確認してください。この要求では削除していません。');
  if (code === 'ACCOUNT_DELETE_IN_PROGRESS') return send(409, code, '以前の削除が途中の状態です。最終確認が整うまで、この画面から削除を再開しません。');
  // This HTTP boundary now performs assessment only. Never imply that an
  // interrupted low-level erasure was rolled back, or expose internal errors.
  console.error('FarmPro operator deletion assessment unavailable');
  return send(503, 'ACCOUNT_REVIEW_UNAVAILABLE', '削除前の確認を完了できませんでした。この要求ではアカウント・利用状態・農場データを変更していません。以前の削除が途中の場合は、その状態を運営者が確認してください。');
}

operatorAccountDeletionRouter.get('/:id/deletion-preview', requireOperator, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const actor = res.locals.authUser;
  if (!actor) { res.status(401).json({ deleted: false, canDelete: false, message: 'ログインが必要です。' }); return; }
  try {
    // Local eligibility is not permission to delete. Keep the public button
    // disabled until the payment-entry lifecycle and final approval are ready.
    res.json(await getPublicOperatorDeletionPreview(String(req.params.id), actor.id));
  } catch (error) {
    failure(res, error);
  }
});

operatorAccountDeletionRouter.post('/:id/delete', requireOperator, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const actor = res.locals.authUser;
  if (!actor) { res.status(401).json({ deleted: false, canDelete: false, message: 'ログインが必要です。' }); return; }
  try {
    // Pass the whole body through strict validation: client-supplied force,
    // review or override flags must not become another authorization path.
    const result = await assessOperatorDeletionRequest(String(req.params.id), actor.id, req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    failure(res, error);
  }
});
