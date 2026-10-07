import { Router, type Response } from 'express';
import { requireOperator } from '../operatorAccess';
import {
  cancelOperatorAccountDeletionRequest, getOperatorDeletionRequestState, requestOperatorAccountDeletion,
} from '../operatorAccountDeletionRequestService';

export const operatorAccountDeletionRequestsRouter = Router();

function failure(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const errors: Record<string, [number, string]> = {
    OPERATOR_REQUIRED: [403, '運営者権限を確認できません。ログイン状態を確認してください。'],
    USER_NOT_FOUND: [404, '対象の利用者が見つかりません。一覧を更新してください。'],
    ACCOUNT_CONFIRMATION_REQUIRED: [400, '対象の農場・メール・依頼番号と確認内容を確認してください。'],
    ACCOUNT_CHANGED: [409, '対象の情報が変わっています。内容を再確認してください。'],
    ACCOUNT_DELETE_BLOCKED: [409, '運営者・共有利用・契約や申込の記録があるため、この確認依頼では受け付けません。'],
    ACCOUNT_BUSY: [409, '対象のアカウントで通信中です。作業を終えてから再確認してください。'],
    ACCOUNT_RETIRED: [409, 'すでに削除処理に入った対象です。この受付・取り消しでは利用再開しません。'],
    ACCOUNT_DELETION_REQUEST_CHANGED: [409, '依頼番号と対象が一致しません。現在の依頼を確認してください。'],
    ACCOUNT_DELETION_REQUEST_EXISTS: [409, 'この農場には確認中の依頼があります。現在の受付状況を確認してください。'],
    ACCOUNT_DELETION_REQUEST_CANCELLED: [409, 'この依頼は取り消し済みです。再依頼は内容を確認して新しい依頼番号で行ってください。'],
    ACCOUNT_DELETION_REQUEST_NOT_FOUND: [404, '指定された確認依頼が見つかりません。受付状況を確認してください。'],
  };
  const known = errors[code];
  if (known) return res.status(known[0]).json({ deleted: false, canDelete: false, code, message: known[1] });
  // The response might be lost after an atomic write. Do not claim rollback or
  // that a hold was never created; a read-only status endpoint resolves this.
  return res.status(503).json({ deleted: false, canDelete: false, code: 'ACCOUNT_DELETION_REQUEST_UNCONFIRMED',
    message: '受付・取り消しの結果を確認できません。完了扱いにせず、受付状況を再取得してください。この処理で農場データの消去や契約変更は行いません。' });
}

operatorAccountDeletionRequestsRouter.get('/:id/deletion-request', requireOperator, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const actor = res.locals.authUser;
  if (!actor) { res.status(401).json({ message: 'ログインが必要です。' }); return; }
  try { res.json(await getOperatorDeletionRequestState(String(req.params.id), actor.id)); }
  catch (error) { failure(res, error); }
});

operatorAccountDeletionRequestsRouter.post('/:id/deletion-request', requireOperator, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const actor = res.locals.authUser;
  if (!actor) { res.status(401).json({ message: 'ログインが必要です。' }); return; }
  try {
    const result = await requestOperatorAccountDeletion(String(req.params.id), actor.id, req.body);
    res.status(result.alreadyRequested ? 200 : 202).json(result);
  } catch (error) { failure(res, error); }
});

operatorAccountDeletionRequestsRouter.post('/:id/deletion-request/cancel', requireOperator, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const actor = res.locals.authUser;
  if (!actor) { res.status(401).json({ message: 'ログインが必要です。' }); return; }
  try { res.json(await cancelOperatorAccountDeletionRequest(String(req.params.id), actor.id, req.body)); }
  catch (error) { failure(res, error); }
});
