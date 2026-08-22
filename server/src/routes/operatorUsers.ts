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

      let paymentSource: 'stripe' | 'bank' | 'free' | 'other' = 'other';
      let paymentIssue = '';

      if (stripeSubscription && activeBankApplication) {
        paymentIssue = 'Stripeと銀行振込が両方とも有効です';
      } else if (stripeSubscription) {
        if (stripeSubscription.plan === user.plan) {
          paymentSource = 'stripe';
        } else {
          paymentIssue = `Stripe記録は${stripeSubscription.plan === 'pro' ? 'Pro' : 'Standard'}、FarmProは${user.plan === 'pro' ? 'Pro' : user.plan === 'standard' ? 'Standard' : 'Free'}です`;
        }
      } else if (activeBankApplication) {
        if (activeBankApplication.plan === user.plan) {
          paymentSource = 'bank';
        } else {
          paymentIssue = `銀行振込記録は${activeBankApplication.plan === 'pro' ? 'Pro' : 'Standard'}、FarmProは${user.plan === 'pro' ? 'Pro' : user.plan === 'standard' ? 'Standard' : 'Free'}です`;
        }
      } else if (user.plan === 'free') {
        paymentSource = 'free';
      } else {
        paymentIssue = '有料プランですが、有効な決済記録がありません';
      }

      return {
        ...user,
        paymentSource,
        paymentIssue,
      };
    }));
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ users: enriched });
  } catch (error) {
    console.error('FarmPro operator user list failed', error);
    res.status(500).json({ message: '利用者一覧を取得できませんでした' });
  }
});

operatorUsersRouter.post('/:id/reset-unpaid-to-free', requireOperator, async (req, res) => {
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
    if (target.plan === 'free') {
      res.status(409).json({ message: 'この利用者はすでにFreeです' });
      return;
    }

    const stripeSubscription = await getActiveSubscriptionSummary(userId);
    if (stripeSubscription) {
      res.status(409).json({ message: 'Stripe契約が有効なため、Freeへ変更できません' });
      return;
    }

    const bankApplications = await listBankTransferApplications();
    const activeBankApplication = bankApplications.find((item) =>
      item.userId === userId && item.status === 'active'
    );
    if (activeBankApplication) {
      res.status(409).json({ message: '銀行振込契約が有効なため、Freeへ変更できません' });
      return;
    }

    const updated = await updateUserPlanById(userId, 'free');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ user: { ...updated, paymentSource: 'free', paymentIssue: '' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'USER_NOT_FOUND') {
      res.status(404).json({ message: '対象の利用者が見つかりません' });
      return;
    }
    console.error('FarmPro unpaid plan reset failed', error);
    res.status(500).json({ message: 'Freeへ変更できませんでした' });
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
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json({
        user: { ...target, plan: 'free', paymentSource: 'free', paymentIssue: '' },
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
