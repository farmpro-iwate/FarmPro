import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { finishLineLogin, getStoredAuthUser, hasAuthToken } from '../services/authClient';

export function LineLoginCompletePage() {
  const navigate = useNavigate();
  const attempted = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (hasAuthToken() || getStoredAuthUser()) {
      setError('別のアカウントでログイン中です。ログアウトしてからLINEログインをやり直してください。');
      return;
    }
    void finishLineLogin()
      .then(() => navigate('/', { replace: true }))
      .catch(err => setError(err instanceof Error ? err.message : 'LINEログインを完了できませんでした。'));
  }, [navigate]);
  return (
    <Stack minHeight="100vh" justifyContent="center" alignItems="center" px={2}>
      <Card sx={{ maxWidth: 440, width: '100%' }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h5" fontWeight={800}>LINEログイン</Typography>
            {error ? <Alert severity="warning">{error}</Alert> :
              <Typography>ログインを確認しています…</Typography>}
            {error && <Button component={RouterLink} to="/login" variant="outlined">ログイン画面へ戻る</Button>}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
