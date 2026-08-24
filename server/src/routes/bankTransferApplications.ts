import { Router } from 'express';
import {
  activateBankTransferApplication,
  createOrGetPendingBankTransferApplication,
  listBankTransferApplications,
  type BankTransferPlanId,
} from '../bankTransferApplicationStore';
import { updateUserPlanById } from '../authStore';
import { sendBankTransferApplicationEmails } from '../emailSender';
import { requireOperator } from '../operatorAccess';

export const bankTransferApplicationsRouter = Router();

const offers: Record<BankTransferPlanId, { label: string; amountTaxIncluded: number }> = {
  standard: { label: 'Standard', amountTaxIncluded: 33000 },
  pro: { label: 'Pro', amountTaxIncluded: 66000 },
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

bankTransferApplicationsRouter.post('/:id/activate', requireOperator, async (req, res) => {
  const operator = res.locals.authUser;
  if (!operator) {
    res.status(401).json({ message: 'ログインが必要です' });
    return;
  }

  const applicationId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!applicationId) {
    res.status(400).json({ message: '申込を確認できませんでした' });
    return;
  }

  try {
    const applications = await listBankTransferApplications();
    const application = applications.find((item) => item.id === applicationId);
    if (!application) {
      res.status(404).json({ message: '銀行振込申込が見つかりません' });
      return;
    }

    if (application.status === 'expired') {
      res.status(409).json({ message: '支払期限を過ぎたため、この申込は自動取消されています' });
      return;
    }
    if (application.status === 'ended') {
      res.status(409).json({ message: 'この銀行振込契約は終了済みです' });
      return;
    }
    if (application.status === 'active') {
      res.json({ application, alreadyActive: true });
      return;
    }

    await updateUserPlanById(application.userId, application.plan);
    const result = await activateBankTransferApplication(application.id, operator.email);
    res.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'USER_NOT_FOUND') {
      res.status(404).json({ message: '対象の利用者が見つかりません' });
      return;
    }
    if (code === 'BANK_TRANSFER_APPLICATION_NOT_FOUND') {
      res.status(404).json({ message: '銀行振込申込が見つかりません' });
      return;
    }
    if (code === 'BANK_TRANSFER_APPLICATION_EXPIRED') {
      res.status(409).json({ message: '支払期限を過ぎたため、この申込は自動取消されています' });
      return;
    }
    if (code === 'BANK_TRANSFER_APPLICATION_ENDED') {
      res.status(409).json({ message: 'この銀行振込契約は終了済みです' });
      return;
    }
    console.error('FarmPro bank transfer activation failed', error);
    res.status(500).json({ message: '銀行振込の入金確認を反映できませんでした' });
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
      billing: 'yearly',
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
