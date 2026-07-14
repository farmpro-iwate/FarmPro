import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { FeedSearchField } from '../components/FeedSearchField';
import {
  createFeeding,
  emptyFeedingInput,
  FeedingInput,
  feedingPurposeOptions,
  feedingUnitOptions
} from '../services/feedingsApi';

function numberValue(valueText: string) {
  const n = Number(valueText);
  return Number.isNaN(n) ? 0 : n;
}

export function FeedingForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FeedingInput>(emptyFeedingInput);
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

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
      await createFeeding(submitData);
      navigate('/feedings');
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料給与記録を登録できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        飼料給与 新規登録
      </Typography>

      <Alert severity="info">
        給与日、対象、飼料名、給与量を中心に入力します。給与量・単価・金額は数字だけで入力してください。
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
                    placeholder="例：母牛群、育成牛群、1234 はなこ"
                    value={form.target}
                    onChange={(e) => updateField('target', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FeedSearchField
                    value={form.feedName}
                    onChange={(name) => updateField('feedName', name)}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="給与量"
                    placeholder="例：120"
                    value={form.amount}
                    onChange={(e) => updateField('amount', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="単価"
                    placeholder="例：80"
                    value={form.unitPrice}
                    onChange={(e) => updateField('unitPrice', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="金額"
                    placeholder="例：9600"
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
                    placeholder="例：朝夕合計、分娩前なので増量、残飼少しあり"
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
                  {saving ? '登録中...' : '登録'}
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
