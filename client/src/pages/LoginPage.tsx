import { FormEvent, useState } from 'react';
import { Alert, Button, Card, CardContent, Divider, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { login } from '../services/authClient';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <Stack minHeight="100vh" alignItems="center" justifyContent="center" px={2} py={4}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent>
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

            {error && <Alert severity="error">{error}</Alert>}

            <Button type="submit" variant="contained" size="large" disabled={running}>
              {running ? 'ログイン中…' : 'ログイン'}
            </Button>

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
