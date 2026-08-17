import { Router } from 'express';
import { emailExists, resetPassword } from '../authStore';
import { sendPasswordResetVerificationEmail } from '../emailSender';
import { createPendingPasswordReset, verifyPendingPasswordReset } from '../passwordResetVerificationStore';

export const passwordResetRouter = Router();

passwordResetRouter.post('/start', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) {
    res.status(400).json({ message: '登録したメールアドレスを入力してください' });
    return;
  }

  try {
    if (await emailExists(email)) {
      const { code } = await createPendingPasswordReset(email);
      await sendPasswordResetVerificationEmail(email, code);
    }
    res.status(202).json({ email, verificationRequired: true });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : '';
    if (errorCode.startsWith('EMAIL_SEND_FAILED') || errorCode === 'RESEND_API_KEY_REQUIRED' || errorCode === 'FARMPRO_EMAIL_FROM_REQUIRED') {
      console.error('FarmPro password reset email failed', error);
      res.status(503).json({ message: '確認メールを送信できませんでした。時間をおいてもう一度お試しください' });
      return;
    }
    console.error('FarmPro password reset start failed', error);
    res.status(500).json({ message: 'パスワード再設定を開始できませんでした' });
  }
});

passwordResetRouter.post('/verify', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!email || !/^\d{6}$/.test(code) || !newPassword) {
    res.status(400).json({ message: 'メールアドレス・6桁の確認コード・新しいパスワードを入力してください' });
    return;
  }

  try {
    await verifyPendingPasswordReset(email, code);
    await resetPassword(email, newPassword);
    res.status(204).end();
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : '';
    if (errorCode === 'PASSWORD_TOO_SHORT') {
      res.status(400).json({ message: '新しいパスワードは8文字以上で入力してください' });
      return;
    }
    if (errorCode === 'INVALID_VERIFICATION_CODE') {
      res.status(400).json({ message: '確認コードが違います' });
      return;
    }
    if (errorCode === 'VERIFICATION_NOT_FOUND') {
      res.status(410).json({ message: '確認コードの有効期限が切れています。もう一度再設定してください' });
      return;
    }
    if (errorCode === 'VERIFICATION_LOCKED') {
      res.status(429).json({ message: '確認コードの入力回数を超えました。もう一度再設定してください' });
      return;
    }
    console.error('FarmPro password reset verify failed', error);
    res.status(500).json({ message: 'パスワードを再設定できませんでした' });
  }
});
