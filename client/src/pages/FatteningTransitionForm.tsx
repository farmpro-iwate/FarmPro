import { FormEvent, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import {
  createFatteningTransition,
  emptyFatteningTransitionInput,
  FatteningTransitionInput,
  FatteningTransitionStatus,
} from '../services/fatteningTransitionsApi';

const statusOptions: FatteningTransitionStatus[] = ['肥育中', '出荷準備', '出荷済み'];

export function FatteningTransitionForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetNumber = searchParams.get('targetNumber') ?? '';
  const targetName = searchParams.get('targetName') ?? '';
  const returnTo = searchParams.get('returnTo') ?? '/fattening-transitions';
  const [form, setForm] = useState<FatteningTransitionInput>(() => ({
    ...emptyFatteningTransitionInput,
    targetNumber,
    targetName,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update<K extends keyof FatteningTransitionInput>(key: K, value: FatteningTransitionInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!form.targetNumber.trim() || !form.targetName.trim()) {
      setError('対象牛が設定されていません。');
      return;
    }

    if (!form.startDate) {
      setError('肥育開始日を入力してください。');
      return;
    }

    setSaving(true);
    try {
      await createFatteningTransition(form);
      navigate('/fattening-transitions');
    } catch (err) {
      setError(err instanceof Error ? err.message : '肥育移行記録を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={1.5}>
      <Typography variant="h5" fontWeight={800}>肥育移行を登録</Typography>
      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Stack component="form" spacing={1.5} onSubmit={handleSubmit}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.25, px: 1.5, '&:last-child': { pb: 1.25 } }}>
                <Grid container spacing={1} alignItems="center">
                  <Grid item xs={12} sm={3}><Typography fontWeight={900}>対象繁殖牛</Typography></Grid>
                  <Grid item xs={7} sm={5}><Typography variant="h6" fontWeight={900}>{form.targetName || '-'}</Typography></Grid>
                  <Grid item xs={5} sm={4}><Typography color="text.secondary">耳標番号：{form.targetNumber || '-'}</Typography></Grid>
                </Grid>
              </CardContent>
            </Card>

            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={4}>
                <TextField label="肥育開始日" type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label="移行理由" value={form.transitionReason} onChange={(e) => update('transitionReason', e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField select label="状態" value={form.status} onChange={(e) => update('status', e.target.value as FatteningTransitionStatus)} fullWidth>
                  {statusOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}><TextField label="開始時体重 kg" value={form.startWeight} onChange={(e) => update('startWeight', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField label="目標体重 kg" value={form.targetWeight} onChange={(e) => update('targetWeight', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField label="目標出荷日" type="date" value={form.targetShippingDate} onChange={(e) => update('targetShippingDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
              <Grid item xs={12} sm={6}><TextField label="飼養場所" value={form.housingLocation} onChange={(e) => update('housingLocation', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} sm={6}><TextField label="休薬終了日" type="date" value={form.withdrawalEndDate} onChange={(e) => update('withdrawalEndDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
              <Grid item xs={12}><TextField label="メモ" value={form.memo} onChange={(e) => update('memo', e.target.value)} multiline minRows={2} fullWidth /></Grid>
            </Grid>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button type="submit" variant="contained" size="large" disabled={saving} fullWidth>{saving ? '保存中...' : '登録する'}</Button>
              <Button component={RouterLink} to={returnTo} variant="outlined" size="large" fullWidth>戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
