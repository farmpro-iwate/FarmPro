import { Router } from 'express';
import { listUsersForOperator } from '../authStore';
import { listBankTransferApplications } from '../bankTransferApplicationStore';
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
