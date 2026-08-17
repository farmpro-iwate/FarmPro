import { FormEvent, useState } from 'react';
import { Alert, Button, Card, CardContent, Divider, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { login, startPasswordReset, verifyPasswordReset } from '../services/authClient';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetPending, setResetPending] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setRunning(true);
    setError('');

    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました。');
    } finally {
      setRunning(false);
    }
  };

  const handleStartReset = async () => {
    setResetMessage('');
    setResetError('');
    if (!resetEmail.trim()) {
      setResetError('登録したメールアドレスを入力してください。');
      return;
    }

    setResetBusy(true);
    try {
      await startPasswordReset(resetEmail);
      setResetPending(true);
      setResetCode('');
      setResetMessage('登録メールアドレス宛てに確認コードを送信しました。');
    } catch (err) {
      setResetError(err instanceof Error ? err.message : '確認コードを送信できませんでした。');
    } finally {
      setResetBusy(false);
    }
  };

  const handleVerifyReset = async () => {
    setResetMessage('');
    setResetError('');
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setResetError('6桁の確認コードを入力してください。');
      return;
    }
    if (resetPassword.length < 8) {
      setResetError('新しいパスワードは8文字以上で入力してください。');
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetError('新しいパスワードの確認入力が一致しません。');
      return;
    }

    setResetBusy(true);
    try {
      await verifyPasswordReset(resetEmail, resetCode, resetPassword);
      setEmail(resetEmail.trim());
      setPassword('');
      setResetCode('');
      setResetPassword('');
      setResetPasswordConfirm('');
      setResetPending(false);
      setResetOpen(false);
      setResetMessage('');
      setError('パスワードを再設定しました。新しいパスワードでログインしてください。');
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'パスワードを再設定できませんでした。');
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <Stack minHeight="100vh" alignItems="center" justifyContent="center" px={2} py={4}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack component="form" spacing={2} onSubmit={handleSubmit}>
              <Stack spacing={0.5}>
                <Typography variant="h5" fontWeight={900}>FarmPro ログイン</Typography>
                <Typography color="text.secondary">
                  FarmProを利用するためのログインです。
                </Typography>
              </Stack>

              <TextField
                label="メールアドレス"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                fullWidth
              />
              <TextField
                label="パスワード"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                fullWidth
              />

              {error && <Alert severity={error.startsWith('パスワードを再設定') ? 'success' : 'error'}>{error}</Alert>}

              <Button type="submit" variant="contained" size="large" disabled={running}>
                {running ? 'ログイン中…' : 'ログイン'}
              </Button>

              <Button
                type="button"
                variant="text"
                onClick={() => {
                  setResetOpen((prev) => !prev);
                  setResetEmail((prev) => prev || email);
                  setResetError('');
                  setResetMessage('');
                }}
              >
                パスワードを忘れた方
              </Button>
            </Stack>

            {resetOpen && (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography fontWeight={800}>パスワードを再設定</Typography>
                    <Typography variant="body2" color="text.secondary">
                      登録したメールアドレスへ6桁の確認コードを送ります。
                    </Typography>
                    <TextField
                      label="登録メールアドレス"
                      type="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      disabled={resetPending || resetBusy}
                      autoComplete="email"
                      fullWidth
                    />

                    {!resetPending ? (
                      <Button type="button" variant="outlined" onClick={handleStartReset} disabled={resetBusy}>
                        {resetBusy ? '送信中…' : '確認コードを送信'}
                      </Button>
                    ) : (
                      <>
                        <Alert severity="warning">
                          確認メールが見つからない場合は、迷惑メールフォルダも確認してください。
                        </Alert>
                        <TextField
                          label="6桁の確認コード"
                          value={resetCode}
                          onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                          autoComplete="one-time-code"
                          fullWidth
                        />
                        <TextField
                          label="新しいパスワード（8文字以上）"
                          type="password"
                          value={resetPassword}
                          onChange={(event) => setResetPassword(event.target.value)}
                          autoComplete="new-password"
                          fullWidth
                        />
                        <TextField
                          label="新しいパスワード（確認）"
                          type="password"
                          value={resetPasswordConfirm}
                          onChange={(event) => setResetPasswordConfirm(event.target.value)}
                          autoComplete="new-password"
                          fullWidth
                        />
                        <Button type="button" variant="contained" onClick={handleVerifyReset} disabled={resetBusy}>
                          {resetBusy ? '変更中…' : '確認してパスワードを変更'}
                        </Button>
                        <Button type="button" variant="text" onClick={handleStartReset} disabled={resetBusy}>
                          確認コードを再送信
                        </Button>
                      </>
                    )}

                    {resetMessage && <Alert severity="info">{resetMessage}</Alert>}
                    {resetError && <Alert severity="error">{resetError}</Alert>}
                  </Stack>
                </CardContent>
              </Card>
            )}

            <Divider>初めての方</Divider>
            <Button component={RouterLink} to="/register" variant="outlined" size="large" fullWidth>
              無料で利用登録する
            </Button>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Freeプランとして登録されます。
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
