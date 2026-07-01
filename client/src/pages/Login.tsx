import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';

export function Login() {
  const navigate = useNavigate();
  return (
    <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center" bgcolor="background.default" px={2}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h4" fontWeight={800} textAlign="center">🐄 繁殖Farm Pro</Typography>
            <Typography color="text.secondary" textAlign="center">ログイン画面</Typography>
            <TextField label="メールアドレス" defaultValue="demo@farmpro.local" fullWidth />
            <TextField label="パスワード" type="password" defaultValue="password" fullWidth />
            <Button variant="contained" size="large" onClick={() => navigate('/')}>ログイン</Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
