import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, Container, Stack, TextField, Typography } from '@mui/material';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@farmpro.local');
  const [password, setPassword] = useState('password');
  const handleLogin = () => {
    if (!email || !password) {
      alert('メールアドレスとパスワードを入力してください');
      return;
    }
    navigate('/');
  };
  return (
    <Box minHeight="100vh" display="flex" alignItems="center" bgcolor="background.default">
      <Container maxWidth="xs">
        <Card><CardContent><Stack spacing={2}>
          <Typography variant="h4" align="center" fontWeight={800}>🐄 繁殖Farm Pro</Typography>
          <Typography align="center" color="text.secondary">繁殖和牛農家向け管理アプリ</Typography>
          <TextField label="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
          <TextField label="パスワード" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
          <Button variant="contained" size="large" onClick={handleLogin}>ログイン</Button>
        </Stack></CardContent></Card>
      </Container>
    </Box>
  );
}
