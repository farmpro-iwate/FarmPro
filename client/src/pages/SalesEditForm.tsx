import { FormEvent, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { emptySaleInput, getSale, recordToInput, SaleInput, SaleStatus, TargetType, updateSale } from '../services/salesApi';

const targetTypes: TargetType[] = ['子牛', '成牛', 'その他'];
const statuses: SaleStatus[] = ['出荷予定', '出荷済み', '販売済み', '取消'];

export function SalesEditForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<SaleInput>(emptySaleInput);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('編集する記録IDがありません。');
      setLoading(false);
      return;
    }

    getSale(id)
      .then((record) => {
        setForm(recordToInput(record));
        setError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '出荷・販売記録を取得できませんでした。');
      })
      .finally(() => setLoading(false));
  }, [id]);

  function update<K extends keyof SaleInput>(key: K, value: SaleInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!id) {
      setError('編集する記録IDがありません。');
      return;
    }

    if (!form.targetNumber.trim() && !form.targetName.trim()) {
      setError('対象番号または対象名を入力してください。');
      return;
    }

    setSaving(true);
    try {
      await updateSale(id, form);
      navigate('/sales');
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>出荷・販売 編集</Typography>
        <Button component={RouterLink} to="/sales" variant="outlined">一覧へ戻る</Button>
      </Stack>

      <Alert severity="info">登録済みの出荷・販売記録を編集できます。更新後は一覧へ戻ります。</Alert>
      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={handleSubmit}>
            <Typography variant="h6" fontWeight={800}>対象情報</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField select label="区分" value={form.targetType} onChange={(e) => update('targetType', e.target.value as TargetType)} fullWidth>
                  {targetTypes.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}><TextField label="対象番号" value={form.targetNumber} onChange={(e) => update('targetNumber', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField label="対象名" value={form.targetName} onChange={(e) => update('targetName', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField label="性別" value={form.sex} onChange={(e) => update('sex', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField label="生年月日" type="date" value={form.birthday} onChange={(e) => update('birthday', e.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="母牛" value={form.motherName} onChange={(e) => update('motherName', e.target.value)} fullWidth /></Grid>
            </Grid>

            <Typography variant="h6" fontWeight={800}>出荷・販売情報</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}><TextField label="出荷予定日" type="date" value={form.shippingPlanDate} onChange={(e) => update('shippingPlanDate', e.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="出荷日" type="date" value={form.shippingDate} onChange={(e) => update('shippingDate', e.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="販売日" type="date" value={form.saleDate} onChange={(e) => update('saleDate', e.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} sm={6}><TextField label="販売先・購買者" value={form.buyer} onChange={(e) => update('buyer', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} sm={6}><TextField label="市場名" value={form.marketName} onChange={(e) => update('marketName', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField label="販売体重 kg" value={form.saleWeight} onChange={(e) => update('saleWeight', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField label="販売金額 円" value={form.salePrice} onChange={(e) => update('salePrice', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} sm={4}>
                <TextField select label="状態" value={form.status} onChange={(e) => update('status', e.target.value as SaleStatus)} fullWidth>
                  {statuses.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12}><TextField label="販売理由" value={form.reason} onChange={(e) => update('reason', e.target.value)} fullWidth /></Grid>
              <Grid item xs={12}><TextField label="メモ" value={form.memo} onChange={(e) => update('memo', e.target.value)} fullWidth multiline minRows={3} /></Grid>
            </Grid>

            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" disabled={saving}>{saving ? '更新中...' : '更新する'}</Button>
              <Button component={RouterLink} to="/sales" variant="outlined">キャンセル</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
