import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { isLoggedIn, login } from '../services/authClient';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('demo@farmpro.local');
  const [password, setPassword] = useState('password');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoggedIn()) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ログインできませんでした');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center" bgcolor="background.default" px={2}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <Typography variant="h4" fontWeight={800} textAlign="center">🐄 繁殖Farm Pro</Typography>
            <Typography color="text.secondary" textAlign="center">農場アカウントでログイン</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="メールアドレス" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" fullWidth required />
            <TextField label="パスワード" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" fullWidth required />
            <Button type="submit" variant="contained" size="large" disabled={submitting}>{submitting ? '確認中…' : 'ログイン'}</Button>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              初回確認用: demo@farmpro.local / password
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
