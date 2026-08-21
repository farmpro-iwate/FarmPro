import crypto from 'node:crypto';
import { Router } from 'express';
import { createBankTransferApplication, type BankTransferPlanId } from '../bankTransferApplicationStore';
import { sendBankTransferApplicationNotification } from '../emailSender';

export const bankTransferApplicationsRouter = Router();

const planAmounts: Record<BankTransferPlanId, number> = {
  standard: 2750,
  pro: 5500,
};

bankTransferApplicationsRouter.post('/', async (req, res) => {
  const user = res.locals.authUser;
  if (!user) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  const plan = req.body?.plan === 'pro' ? 'pro' : req.body?.plan === 'standard' ? 'standard' : null;
  if (!plan) {
    res.status(400).json({ message: '申込プランを確認してください' });
    return;
  }

  const applicationId = `bank-${crypto.randomUUID()}`;
  const amountTaxIncluded = planAmounts[plan];

  try {
    await sendBankTransferApplicationNotification({
      applicationId,
      farmName: user.farmName,
      name: user.name,
      email: user.email,
      plan,
      amountTaxIncluded,
    });

    const application = await createBankTransferApplication({
      id: applicationId,
      userId: user.id,
      farmId: user.farmId,
      farmName: user.farmName,
      name: user.name,
      email: user.email,
      plan,
      amountTaxIncluded,
      billing: 'monthly',
    });

    res.status(201).json({
      application: {
        id: application.id,
        plan: application.plan,
        amountTaxIncluded: application.amountTaxIncluded,
        status: application.status,
        createdAt: application.createdAt,
      },
      message: '銀行振込のお申し込みを受け付けました。振込先と支払期限をご案内します。',
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : '';
    if (
      errorCode === 'FARMPRO_BANK_TRANSFER_NOTIFICATION_EMAIL_REQUIRED' ||
      errorCode === 'RESEND_API_KEY_REQUIRED' ||
      errorCode === 'FARMPRO_EMAIL_FROM_REQUIRED' ||
      errorCode.startsWith('EMAIL_SEND_FAILED')
    ) {
      console.error('FarmPro bank transfer notification failed', error);
      res.status(503).json({ message: '銀行振込のお申し込みを受け付けられませんでした。時間をおいてもう一度お試しください' });
      return;
    }

    console.error('FarmPro bank transfer application failed', error);
    res.status(500).json({ message: '銀行振込のお申し込みを受け付けられませんでした' });
  }
});
