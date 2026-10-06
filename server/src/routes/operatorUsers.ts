import { Router } from 'express';
import { listUsersForOperator, updateUserActiveById, updateUserPlanById } from '../authStore';
import { listBankTransferApplications } from '../bankTransferApplicationStore';
import { getBankNonRenewalSummary, requestBankNonRenewal } from '../bankTransferNonRenewalStore';
import { getActiveSubscriptionSummary } from '../stripeWebhook';
import { requireOperator } from '../operatorAccess';
import { listAiUnansweredLogs } from '../aiUnansweredStore';
import { runWithFarm } from '../farmContext';

export const operatorUsersRouter = Router();


operatorUsersRouter.get('/ai-unanswered', requireOperator, async (_req, res) => {
  try {
    const users = await listUsersForOperator();
    const logs = (
      await Promise.all(
        users.map(async (user) => {
          const farmLogs = await runWithFarm(user.farmId, () => listAiUnansweredLogs());
          return farmLogs.map((item) => ({
            ...item,
            farmId: user.farmId,
            farmName: user.farmName,
            plan: user.plan,
          }));
        }),
      )
    )
      .flat()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ logs });
  } catch (error) {
    console.error('FarmPro operator AI unanswered list failed', error);
    res.status(500).json({ message: '未回答AI質問を取得できませんでした' });
  }
});

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

      const bankNonRenewal = await getBankNonRenewalSummary(user, bankApplications);
      return {
        ...user,
        paymentSource,
        paymentIssue,
        bankNonRenewal: bankNonRenewal && paymentIssue
          ? { ...bankNonRenewal, canRequest: false, reason: paymentIssue }
          : bankNonRenewal,
      };
    }));
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ users: enriched });
  } catch (error) {
    console.error('FarmPro operator user list failed', error);
    res.status(500).json({ message: '利用者一覧を取得できませんでした' });
  }
});

operatorUsersRouter.post('/:id/active', requireOperator, async (req, res) => {
  const operator = res.locals.authUser;
  if (!operator) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  const userId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const active = req.body?.active;
  if (!userId || typeof active !== 'boolean') {
    res.status(400).json({ message: '利用状態を確認できませんでした' });
    return;
  }
  if (userId === operator.id && active === false) {
    res.status(409).json({ message: '現在ログイン中の運営者自身は停止できません' });
    return;
  }

  try {
    const updated = await updateUserActiveById(userId, active);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ user: updated });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'USER_NOT_FOUND') {
      res.status(404).json({ message: '対象の利用者が見つかりません' });
      return;
    }
    console.error('FarmPro user active state update failed', error);
    res.status(500).json({ message: '利用状態を変更できませんでした' });
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

// An old cached screen must not silently perform the former immediate downgrade.
operatorUsersRouter.post('/:id/end-bank-transfer', requireOperator, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(409).json({ message: 'この即時終了操作は利用できません。画面を更新し「次年度を継続しない」を選んでください。契約期間やプランは変更していません。' });
});

operatorUsersRouter.post('/:id/bank-non-renewal', requireOperator, async (req, res) => {
  const operator = res.locals.authUser;
  if (!operator) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }
  const userId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const applicationId = typeof req.body?.applicationId === 'string' ? req.body.applicationId : '';
  const contractEndsAt = typeof req.body?.contractEndsAt === 'string' ? req.body.contractEndsAt : '';
  if (!userId || !applicationId || !contractEndsAt || req.body?.confirmed !== true) {
    res.status(400).json({ message: '対象の利用者・契約終了日時・確認内容を確認してください' });
    return;
  }

  try {
    const target = (await listUsersForOperator()).find((user) => user.id === userId);
    if (!target) {
      res.status(404).json({ message: '対象の利用者が見つかりません' });
      return;
    }
    if (await getActiveSubscriptionSummary(userId)) {
      res.status(409).json({ message: 'Stripe契約も有効です。契約内容を確認してください。この操作ではカード契約を解約しません。' });
      return;
    }
    const result = await requestBankNonRenewal(target, operator.id, { applicationId, contractEndsAt });
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      alreadyRequested: result.alreadyRequested,
      user: { ...target, paymentSource: 'bank', paymentIssue: '', bankNonRenewal: result.bankNonRenewal },
      message: '次年度を継続しない旨を受け付けました。支払済みの契約終了日時まで利用できます。プランと農場データは変更していません。',
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (['ACTIVE_BANK_TRANSFER_NOT_FOUND', 'BANK_NON_RENEWAL_NEEDS_REVIEW', 'BANK_CONTRACT_CHANGED'].includes(code)) {
      res.status(409).json({ message: '契約状態が変更されたか、確認が必要です。画面を更新し、他の契約・入金待ち申込・契約終了日時を確認してください。' });
      return;
    }
    console.error('FarmPro bank non-renewal receipt failed', code);
    res.status(500).json({ message: '継続なしの受付を確認できませんでした。画面を更新して受付状況を確認してください。' });
  }
});
