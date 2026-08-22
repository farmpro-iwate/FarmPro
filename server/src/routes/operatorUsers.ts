import { Router } from 'express';
import { listUsersForOperator, updateUserPlanById } from '../authStore';
import { endActiveBankTransferForUser, listBankTransferApplications } from '../bankTransferApplicationStore';
import { getActiveSubscriptionSummary } from '../stripeWebhook';
import { requireOperator } from '../operatorAccess';

export const operatorUsersRouter = Router();

operatorUsersRouter.get('/', requireOperator, async (_req, res) => {
  try {
    const users = await listUsersForOperator();
    const bankApplications = await listBankTransferApplications();
    const enriched = await Promise.all(users.map(async (user) => {
      const stripeSubscription = await getActiveSubscriptionSummary(user.id);
      const activeBankApplication = bankApplications.find((item) =>
        item.userId === user.id && item.status === 'active'
      );

      const paymentSource = stripeSubscription
        ? 'stripe'
        : activeBankApplication
          ? 'bank'
          : user.plan === 'free'
            ? 'free'
            : 'other';

      return {
        ...user,
        paymentSource,
      };
    }));
    res.json({ users: enriched });
  } catch (error) {
    console.error('FarmPro operator user list failed', error);
    res.status(500).json({ message: '利用者一覧を取得できませんでした' });
  }
});

operatorUsersRouter.post('/:id/end-bank-transfer', requireOperator, async (req, res) => {
  const operator = res.locals.authUser;
  if (!operator) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  const userId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!userId) {
    res.status(400).json({ message: '利用者を確認できませんでした' });
    return;
  }

  try {
    const users = await listUsersForOperator();
    const target = users.find((user) => user.id === userId);
    if (!target) {
      res.status(404).json({ message: '対象の利用者が見つかりません' });
      return;
    }

    const stripeSubscription = await getActiveSubscriptionSummary(userId);
    if (stripeSubscription) {
      res.status(409).json({ message: 'Stripe契約が有効なため、FarmPro側から銀行振込終了処理はできません' });
      return;
    }

    const bankApplications = await listBankTransferApplications();
    const activeBankApplication = bankApplications.find((item) =>
      item.userId === userId && item.status === 'active'
    );
    if (!activeBankApplication) {
      res.status(409).json({ message: '有効な銀行振込契約が確認できません' });
      return;
    }

    const previousPlan = target.plan;
    await updateUserPlanById(userId, 'free');
    try {
      const endedApplication = await endActiveBankTransferForUser(userId, operator.email);
      res.json({
        user: { ...target, plan: 'free' },
        bankTransferApplication: endedApplication,
      });
    } catch (error) {
      await updateUserPlanById(userId, previousPlan);
      throw error;
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'USER_NOT_FOUND') {
      res.status(404).json({ message: '対象の利用者が見つかりません' });
      return;
    }
    if (code === 'ACTIVE_BANK_TRANSFER_NOT_FOUND') {
      res.status(409).json({ message: '有効な銀行振込契約が確認できません' });
      return;
    }
    console.error('FarmPro bank transfer end failed', error);
    res.status(500).json({ message: '銀行振込契約を終了できませんでした' });
  }
});
