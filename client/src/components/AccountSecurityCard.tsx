import { useState } from 'react';
import { Alert, Button, Card, CardContent, Divider, Stack, TextField, Typography } from '@mui/material';
import {
  changePassword,
  startEmailChange,
  verifyEmailChange,
  type AuthUser,
} from '../services/authClient';

type Props = {
  onUserChange?: (user: AuthUser) => void;
};

export function AccountSecurityCard({ onUserChange }: Props) {
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailPending, setEmailPending] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleStartEmailChange = async () => {
    setEmailMessage('');
    setEmailError('');
    if (!newEmail.trim() || !emailPassword) {
      setEmailError('新しいメールアドレスと現在のパスワードを入力してください。');
      return;
    }

    setEmailBusy(true);
    try {
      await startEmailChange(newEmail, emailPassword);
      setEmailPending(true);
      setEmailCode('');
      setEmailMessage('新しいメールアドレスに6桁の確認コードを送信しました。');
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : '確認コードを送信できませんでした。');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleVerifyEmailChange = async () => {
    setEmailMessage('');
    setEmailError('');
    if (!/^\d{6}$/.test(emailCode.trim())) {
      setEmailError('6桁の確認コードを入力してください。');
      return;
    }

    setEmailBusy(true);
    try {
      const user = await verifyEmailChange(emailCode);
      onUserChange?.(user);
      setNewEmail('');
      setEmailPassword('');
      setEmailCode('');
      setEmailPending(false);
      setEmailMessage('メールアドレスを変更しました。次回から新しいメールアドレスでログインしてください。');
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'メールアドレスを変更できませんでした。');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordMessage('');
    setPasswordError('');
    if (!currentPassword || !newPassword) {
      setPasswordError('現在のパスワードと新しいパスワードを入力してください。');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('新しいパスワードは8文字以上で入力してください。');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError('新しいパスワードの確認入力が一致しません。');
      return;
    }

    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setPasswordMessage('パスワードを変更しました。');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'パスワードを変更できませんでした。');
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <Card className="no-print" variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={800}>ログイン情報の変更</Typography>
          <Typography color="text.secondary">
            メールアドレス変更は新しいメールアドレスで本人確認を行います。パスワード変更には現在のパスワードが必要です。
          </Typography>

          <Stack spacing={1.5} component="form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
            <Typography fontWeight={800}>メールアドレスを変更</Typography>
            <TextField
              label="新しいメールアドレス"
              type="email"
              name="farmpro-new-email"
              autoComplete="off"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={emailPending || emailBusy}
              fullWidth
            />
            <TextField
              label="現在のパスワード"
              type="password"
              name="farmpro-email-change-current-password"
              autoComplete="current-password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              disabled={emailPending || emailBusy}
              fullWidth
            />
            {!emailPending ? (
              <Button type="button" variant="outlined" onClick={handleStartEmailChange} disabled={emailBusy} sx={{ alignSelf: 'flex-start' }}>
                {emailBusy ? '送信中…' : '確認コードを送信'}
              </Button>
            ) : (
              <>
                <TextField
                  label="6桁の確認コード"
                  name="farmpro-email-change-code"
                  autoComplete="one-time-code"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                  disabled={emailBusy}
                  fullWidth
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button type="button" variant="contained" onClick={handleVerifyEmailChange} disabled={emailBusy}>
                    {emailBusy ? '確認中…' : '確認して変更'}
                  </Button>
                  <Button type="button" variant="text" onClick={() => { setEmailPending(false); setEmailCode(''); setEmailMessage(''); setEmailError(''); }} disabled={emailBusy}>
                    変更をやめる
                  </Button>
                </Stack>
              </>
            )}
            {emailMessage && <Alert severity="success">{emailMessage}</Alert>}
            {emailError && <Alert severity="error">{emailError}</Alert>}
          </Stack>

          <Divider />

          <Stack spacing={1.5} component="form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
            <Typography fontWeight={800}>パスワードを変更</Typography>
            <TextField
              label="現在のパスワード"
              type="password"
              name="farmpro-password-change-current"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              fullWidth
            />
            <TextField
              label="新しいパスワード（8文字以上）"
              type="password"
              name="farmpro-password-change-new"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
            />
            <TextField
              label="新しいパスワード（確認）"
              type="password"
              name="farmpro-password-change-confirm"
              autoComplete="new-password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              fullWidth
            />
            <Button type="button" variant="outlined" onClick={handleChangePassword} disabled={passwordBusy} sx={{ alignSelf: 'flex-start' }}>
              {passwordBusy ? '変更中…' : 'パスワードを変更'}
            </Button>
            {passwordMessage && <Alert severity="success">{passwordMessage}</Alert>}
            {passwordError && <Alert severity="error">{passwordError}</Alert>}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
