import { useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { completeLineSignup, getStoredAuthUser, hasAuthToken } from '../services/authClient';

export function LineSignupPage() {
  const navigate = useNavigate();
  const [farmName,setFarmName] = useState('');
  const [name,setName] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const signedIn = hasAuthToken() || Boolean(getStoredAuthUser());
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || signedIn) return;
    setBusy(true);setError('');
    try {
      await completeLineSignup(farmName,name);
      navigate('/',{replace:true});
    } catch (e) {
      setError(e instanceof Error ? e.message : '登録に失敗しました');
    } finally {setBusy(false);}
  }
  return <Stack minHeight="100vh" justifyContent="center" alignItems="center" px={2}>
    <Card sx={{maxWidth:440,width:'100%'}}>
      <CardContent>
        <Stack component="form" spacing={2} onSubmit={submit}>
          <Typography variant="h5" fontWeight={800}>LINEでFree登録</Typography>
          <Typography>LINE認証が完了しました。農場名と利用者名を入力してください。</Typography>
          <TextField label="農場名" required value={farmName} onChange={e=>setFarmName(e.target.value)} inputProps={{maxLength:100}}/>
          <TextField label="利用者名" required value={name} onChange={e=>setName(e.target.value)} inputProps={{maxLength:100}}/>
          {signedIn && <Alert severity="warning">別のアカウントでログイン中です。ログアウトしてからやり直してください。</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" disabled={busy||signedIn||!farmName.trim()||!name.trim()}>
            {busy?'登録中…':'Free登録を完了'}
          </Button>
          <Button component={RouterLink} to="/login">ログイン画面へ戻る</Button>
        </Stack>
      </CardContent>
    </Card>
  </Stack>;
}
