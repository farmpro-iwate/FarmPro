import { FormEvent, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { startFreeRegistration, verifyFreeRegistration } from '../services/authClient';

export function RegisterPage() {
  const navigate = useNavigate();
  const [farmName, setFarmName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [running, setRunning] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setRunning(true);
    setError('');
    setMessage('');

    try {
      if (!verificationSent) {
        const result = await startFreeRegistration({ farmName, name, email, password });
        setEmail(result.email);
        setVerificationSent(true);
        setMessage('確認コードをメールで送信しました。メールに届いた6桁のコードを入力してください。');
      } else {
        await verifyFreeRegistration(email, verificationCode);
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '利用登録に失敗しました。');
    } finally {
      setRunning(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    setMessage('');
    setVerificationCode('');

    try {
      const result = await startFreeRegistration({ farmName, name, email, password });
      setEmail(result.email);
      setMessage('確認コードを再送信しました。新しく届いた6桁のコードを入力してください。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '確認コードを再送信できませんでした。');
    } finally {
      setResending(false);
    }
  };

  const restartRegistration = () => {
    setVerificationSent(false);
    setVerificationCode('');
    setError('');
    setMessage('');
  };

  const submitLabel = running
    ? '処理中…'
    : verificationSent
      ? '確認して無料利用を始める'
      : '確認コードをメール送信';

  return (
    <Stack minHeight="100vh" alignItems="center" justifyContent="center" px={2} py={4}>
      <Card sx={{ width: '100%', maxWidth: 460 }}>
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={handleSubmit}>
            <Stack spacing={0.75}>
              <Typography variant="h5" fontWeight={900}>FarmPro Free を始める</Typography>
              <Typography fontWeight={700} color="primary.main">
                繁殖雌牛10頭まで無料・クレジットカード不要
              </Typography>
              <Typography color="text.secondary">
                農場情報とログイン情報を登録し、メールアドレスを確認すると、そのままFarmPro Freeを利用できます。
              </Typography>
            </Stack>

            {!verificationSent ? (
              <>
                <TextField label="農場名" value={farmName} onChange={(event) => setFarmName(event.target.value)} required fullWidth />
                <TextField label="お名前" value={name} onChange={(event) => setName(event.target.value)} required fullWidth />
                <TextField label="メールアドレス" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required fullWidth />
                <TextField label="パスワード（8文字以上）" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required inputProps={{ minLength: 8 }} fullWidth />
              </>
            ) : (
              <>
                <Alert severity="info">{email} に確認コードを送信しました。</Alert>
                <TextField
                  label="6桁の確認コード"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputProps={{ inputMode: 'numeric', pattern: '[0-9]{6}', maxLength: 6 }}
                  required
                  fullWidth
                  autoFocus
                />
                <Typography variant="body2" color="text.secondary">
                  確認コードは10分間有効です。届かない場合は迷惑メールも確認してください。
                </Typography>
              </>
            )}

            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            <Button type="submit" variant="contained" size="large" disabled={running || resending || (verificationSent && verificationCode.length !== 6)}>
              {submitLabel}
            </Button>

            {verificationSent && (
              <Stack spacing={0.5}>
                <Button type="button" variant="outlined" onClick={handleResend} disabled={running || resending}>
                  {resending ? '再送信中…' : '確認コードを再送信'}
                </Button>
                <Typography variant="caption" color="text.secondary" textAlign="center">
                  再送信すると、それまでの確認コードは使えなくなります。
                </Typography>
                <Button type="button" variant="text" onClick={restartRegistration} disabled={running || resending}>
                  登録内容を修正する
                </Button>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default RegisterPage;
