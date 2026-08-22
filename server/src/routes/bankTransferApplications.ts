import { Router } from 'express';
import {
  createOrGetPendingBankTransferApplication,
  listBankTransferApplications,
  type BankTransferPlanId,
} from '../bankTransferApplicationStore';
import { sendBankTransferApplicationEmails } from '../emailSender';
import { requireOperator } from '../operatorAccess';

export const bankTransferApplicationsRouter = Router();

const offers: Record<BankTransferPlanId, { label: string; amountTaxIncluded: number }> = {
  standard: { label: 'Standard', amountTaxIncluded: 2750 },
  pro: { label: 'Pro', amountTaxIncluded: 5500 },
};

bankTransferApplicationsRouter.get('/', requireOperator, async (_req, res) => {
  try {
    const applications = await listBankTransferApplications();
    res.json({ applications });
  } catch (error) {
    console.error('FarmPro bank transfer application list failed', error);
    res.status(500).json({ message: '銀行振込申込一覧を取得できませんでした' });
  }
});

bankTransferApplicationsRouter.post('/', async (req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  const plan = req.body?.plan === 'pro' ? 'pro' : req.body?.plan === 'standard' ? 'standard' : null;
  if (!plan) {
    res.status(400).json({ message: 'プランを確認してください' });
    return;
  }

  const offer = offers[plan];

  try {
    const result = await createOrGetPendingBankTransferApplication({
      userId: user.id,
      farmId: user.farmId,
      farmName: user.farmName,
      name: user.name,
      email: user.email,
      plan,
      amountTaxIncluded: offer.amountTaxIncluded,
      billing: 'monthly',
    });

    if (result.created) {
      await sendBankTransferApplicationEmails({
        applicationId: result.application.id,
        farmName: result.application.farmName,
        name: result.application.name,
        email: result.application.email,
        planLabel: offer.label,
        amountTaxIncluded: result.application.amountTaxIncluded,
        createdAt: result.application.createdAt,
      });
    }

    res.status(result.created ? 201 : 200).json({
      application: result.application,
      alreadyPending: !result.created,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (
      code.startsWith('EMAIL_SEND_FAILED') ||
      code === 'RESEND_API_KEY_REQUIRED' ||
      code === 'FARMPRO_EMAIL_FROM_REQUIRED' ||
      code === 'FARMPRO_BANK_TRANSFER_NOTIFICATION_EMAIL_REQUIRED'
    ) {
      console.error('FarmPro bank transfer email failed', error);
      res.status(503).json({ message: '銀行振込の受付メールを送信できませんでした。時間をおいてもう一度お試しください' });
      return;
    }
    console.error('FarmPro bank transfer application failed', error);
    res.status(500).json({ message: '銀行振込のお申し込みを受け付けできませんでした' });
  }
});
