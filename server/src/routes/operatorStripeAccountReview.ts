import { Router } from 'express';
import { requireOperator } from '../operatorAccess';
import { validAccountIdentifier } from '../accountDeletionGuard';
import { getOperatorDeletionPreview } from '../operatorAccountDeletionStore';
import { reviewStripeAccount } from '../stripeAccountReview';

export const operatorStripeAccountReviewRouter = Router();

// Read-only inspection. This route neither invokes account deletion nor changes
// billing records. No-match evidence is never a deletion authorization token.
operatorStripeAccountReviewRouter.get('/:id/stripe-review', requireOperator, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const actor = res.locals.authUser;
  if (!actor) { res.status(401).json({ canDelete: false, message: 'ログインが必要です。' }); return; }
  const userId = req.params.id;
  if (!validAccountIdentifier(userId)) {
    res.status(400).json({ canDelete: false, message: '対象の利用者を確認してください。' });
    return;
  }
  try {
    const before = await getOperatorDeletionPreview(userId, actor.id);
    if (!before.canDelete || before.resuming) {
      res.status(409).json({ canDelete: false, message: before.reason || '削除処理中のため、この照合は開始できません。削除状態を確認してください。' });
      return;
    }
    // Release the JSON lock during network I/O. Use only the stored identity,
    // never request-supplied email, API key, account ID, mode or endpoint.
    const stripeReview = await reviewStripeAccount(before.user);
    // The operator may have lost access, or the target may have changed while
    // Stripe was being read. Do not return a result bound to an old identity.
    const after = await getOperatorDeletionPreview(userId, actor.id);
    if (!after.canDelete || after.resuming || after.revision !== before.revision) {
      res.status(409).json({ canDelete: false, message: '照合中に利用者または契約の状態が変わりました。内容を再確認してください。削除していません。' });
      return;
    }
    res.json({ userId, farmId: after.user.farmId, canDelete: false, stripeReview });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'OPERATOR_REQUIRED') {
      res.status(403).json({ canDelete: false, message: '運営者権限を確認できません。' });
    } else if (code === 'USER_NOT_FOUND') {
      res.status(404).json({ canDelete: false, message: '対象の利用者が見つかりません。一覧を更新してください。' });
    } else {
      // Do not include Stripe response content, personal data or key material.
      res.status(503).json({ canDelete: false, message: '照合結果を確認できませんでした。契約や農場データは、この照合では変更していません。' });
    }
  }
});
