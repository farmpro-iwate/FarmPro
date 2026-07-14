import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  emptyFeedingInput,
  FeedingInput,
  feedingPurposeOptions,
  feedingUnitOptions,
  getFeeding,
  recordToInput,
  updateFeeding
} from '../services/feedingsApi';

function numberValue(valueText: string) {
  const n = Number(valueText);
  return Number.isNaN(n) ? 0 : n;
}

export function FeedingEditForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<FeedingInput>(emptyFeedingInput);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateField<K extends keyof FeedingInput>(key: K, value: FeedingInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const calculatedTotalPrice = useMemo(() => {
    const amount = numberValue(form.amount);
    const unitPrice = numberValue(form.unitPrice);

    if (amount <= 0 || unitPrice <= 0) return '';
    return String(Math.round(amount * unitPrice));
  }, [form.amount, form.unitPrice]);

  function applyCalculatedTotalPrice() {
    if (calculatedTotalPrice) {
      updateField('totalPrice', calculatedTotalPrice);
    }
  }

  useEffect(() => {
    async function load() {
      if (!id) {
        setError('飼料給与IDがありません。');
        setLoading(false);
        return;
      }

      try {
        const record = await getFeeding(id);
        setForm(recordToInput(record));
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '飼料給与記録を取得できませんでした。');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!id) {
      setError('飼料給与IDがありません。');
      return;
    }

    if (!form.feedingDate) {
      setError('給与日を入力してください。');
      return;
    }

    if (!form.target.trim()) {
      setError('対象を入力してください。例：母牛群');
      return;
    }

    if (!form.feedName.trim()) {
      setError('飼料名を入力してください。例：配合飼料');
      return;
    }

    if (!form.amount.trim()) {
      setError('給与量を入力してください。');
      return;
    }

    const amountNumber = Number(form.amount);
    if (Number.isNaN(amountNumber) || amountNumber < 0) {
      setError('給与量は数字で入力してください。例：120');
      return;
    }

    if (form.unitPrice && Number.isNaN(Number(form.unitPrice))) {
      setError('単価は数字で入力してください。例：80');
      return;
    }

    if (form.totalPrice && Number.isNaN(Number(form.totalPrice))) {
      setError('金額は数字で入力してください。例：9600');
      return;
    }

    const submitData: FeedingInput = {
      ...form,
      totalPrice: form.totalPrice || calculatedTotalPrice
    };

    setSaving(true);

    try {
      await updateFeeding(id, submitData);
      navigate('/feedings');
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料給与記録を更新できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        飼料給与 編集
      </Typography>

      <Alert severity="info">
        登録済みの飼料給与記録を修正できます。給与量・単価・金額は数字だけで入力してください。
      </Alert>

      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="給与日"
                    type="date"
                    value={form.feedingDate}
                    onChange={(e) => updateField('feedingDate', e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="単位"
                    value={form.unit}
                    onChange={(e) => updateField('unit', e.target.value)}
                    fullWidth
                  >
                    {feedingUnitOptions.map((item) => (
                      <MenuItem key={item} value={item}>{item}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="給与目的"
                    value={form.purpose}
                    onChange={(e) => updateField('purpose', e.target.value)}
                    fullWidth
                  >
                    {feedingPurposeOptions.map((item) => (
                      <MenuItem key={item} value={item}>{item}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    label="対象"
                    value={form.target}
                    onChange={(e) => updateField('target', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    label="飼料名"
                    value={form.feedName}
                    onChange={(e) => updateField('feedName', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="給与量"
                    value={form.amount}
                    onChange={(e) => updateField('amount', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="単価"
                    value={form.unitPrice}
                    onChange={(e) => updateField('unitPrice', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="金額"
                    value={form.totalPrice}
                    onChange={(e) => updateField('totalPrice', e.target.value)}
                    fullWidth
                    helperText={calculatedTotalPrice ? `計算候補：${Number(calculatedTotalPrice).toLocaleString('ja-JP')}円` : '給与量 × 単価'}
                  />
                </Grid>

                {calculatedTotalPrice && (
                  <Grid item xs={12}>
                    <Button variant="outlined" onClick={applyCalculatedTotalPrice}>
                      計算した金額を入力する
                    </Button>
                  </Grid>
                )}

                <Grid item xs={12}>
                  <TextField
                    label="メモ"
                    value={form.memo}
                    onChange={(e) => updateField('memo', e.target.value)}
                    fullWidth
                    multiline
                    minRows={3}
                  />
                </Grid>
              </Grid>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" disabled={saving} fullWidth>
                  {saving ? '更新中...' : '更新'}
                </Button>
                <Button variant="outlined" onClick={() => navigate('/feedings')} disabled={saving} fullWidth>
                  一覧へ戻る
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Stack>
  );
}
