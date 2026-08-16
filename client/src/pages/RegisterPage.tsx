import { FormEvent, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { registerFreeUser } from '../services/authClient';

export function RegisterPage() {
  const navigate = useNavigate();
  const [farmName, setFarmName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setRunning(true);
    setError('');

    try {
      await registerFreeUser({ farmName, name, email, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '利用登録に失敗しました。');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Stack minHeight="100vh" alignItems="center" justifyContent="center" px={2} py={4}>
      <Card sx={{ width: '100%', maxWidth: 460 }}>
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={handleSubmit}>
            <Stack spacing={0.5}>
              <Typography variant="h5" fontWeight={900}>FarmPro 利用登録</Typography>
              <Typography color="text.secondary">
                最初に農場情報とログイン情報を登録します。無料プランからそのまま利用できます。
              </Typography>
            </Stack>

            <TextField label="農場名" value={farmName} onChange={(event) => setFarmName(event.target.value)} required fullWidth />
            <TextField label="お名前" value={name} onChange={(event) => setName(event.target.value)} required fullWidth />
            <TextField label="メールアドレス" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required fullWidth />
            <TextField label="パスワード（8文字以上）" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required inputProps={{ minLength: 8 }} fullWidth />

            {error && <Alert severity="error">{error}</Alert>}

            <Button type="submit" variant="contained" size="large" disabled={running}>
              {running ? '登録中…' : '無料で利用を始める'}
            </Button>
            <Button component={RouterLink} to="/login" variant="text">
              すでに登録済みの方はログイン
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default RegisterPage;
