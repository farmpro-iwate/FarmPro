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
import {
  createFeedInventory,
  emptyFeedInventoryInput,
  FeedInventoryInput,
  feedInventoryTransactionTypeOptions,
  feedInventoryUnitOptions
} from '../services/feedInventoryApi';
import { FeedSearchField } from '../components/FeedSearchField';
import { PartnerSearchField } from '../components/PartnerSearchField';

function numberValue(valueText: string) {
  const n = Number(valueText);
  return Number.isNaN(n) ? 0 : n;
}

function quantityField(unit: string) {
  if (unit === 'kg') return { label: '重量（kg）', placeholder: '例：500' };
  if (unit === '袋') return { label: '袋数', placeholder: '例：20' };
  if (unit === 'ロール') return { label: 'ロール数', placeholder: '例：8' };
  if (unit === '束') return { label: '束数', placeholder: '例：15' };
  if (unit === '個') return { label: '個数', placeholder: '例：10' };
  return { label: '数量', placeholder: '例：10' };
}

export function FeedInventoryForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FeedInventoryInput>(emptyFeedInventoryInput);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const quantityInput = quantityField(form.unit);

  function updateField<K extends keyof FeedInventoryInput>(key: K, value: FeedInventoryInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const calculatedTotalPrice = useMemo(() => {
    const quantity = numberValue(form.quantity);
    const unitPrice = numberValue(form.unitPrice);
    if (quantity <= 0 || unitPrice <= 0) return '';
    return String(Math.round(quantity * unitPrice));
  }, [form.quantity, form.unitPrice]);

  const calculatedTotalWeightKg = useMemo(() => {
    if (form.unit !== '袋') return '';
    const bags = numberValue(form.quantity);
    const weightPerBag = numberValue(form.bagWeightKg);
    if (bags <= 0 || weightPerBag <= 0) return '';
    return String(bags * weightPerBag);
  }, [form.unit, form.quantity, form.bagWeightKg]);

  function applyCalculatedTotalPrice() {
    if (calculatedTotalPrice) {
      updateField('totalPrice', calculatedTotalPrice);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.transactionDate) {
      setError('入出庫日を入力してください。');
      return;
    }
    if (!form.feedName.trim()) {
      setError('飼料名を入力してください。例：配合飼料');
      return;
    }
    if (!form.quantity.trim()) {
      setError('数量を入力してください。');
      return;
    }
    if (Number.isNaN(Number(form.quantity))) {
      setError('数量は数字で入力してください。例：500');
      return;
    }
    if (form.unit === '袋' && (!form.bagWeightKg || Number(form.bagWeightKg) <= 0)) {
      setError('1袋の重量をkgで入力してください。例：20');
      return;
    }
    if (form.unitPrice && Number.isNaN(Number(form.unitPrice))) {
      setError('単価は数字で入力してください。例：80');
      return;
    }
    if (form.totalPrice && Number.isNaN(Number(form.totalPrice))) {
      setError('金額は数字で入力してください。例：40000');
      return;
    }

    const submitData: FeedInventoryInput = {
      ...form,
      totalWeightKg: form.unit === '袋' ? calculatedTotalWeightKg : '',
      totalPrice: form.totalPrice || calculatedTotalPrice
    };

    setSaving(true);
    try {
      await createFeedInventory(submitData);
      navigate('/feed-inventory');
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料在庫記録を登録できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        飼料在庫 新規登録
      </Typography>

      <Alert severity="info">
        飼料の入庫・出庫・調整を記録します。数量・単価・金額は数字だけで入力してください。
      </Alert>

      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="入出庫日"
                    type="date"
                    value={form.transactionDate}
                    onChange={(e) => updateField('transactionDate', e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="区分"
                    value={form.transactionType}
                    onChange={(e) => updateField('transactionType', e.target.value)}
                    fullWidth
                  >
                    {feedInventoryTransactionTypeOptions.map((item) => (
                      <MenuItem key={item} value={item}>{item}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="単位"
                    value={form.unit}
                    onChange={(e) => updateField('unit', e.target.value)}
                    fullWidth
                  >
                    {feedInventoryUnitOptions.map((item) => (
                      <MenuItem key={item} value={item}>{item}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={6}>
                  <FeedSearchField
                    value={form.feedName}
                    onChange={(name) => updateField('feedName', name)}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <PartnerSearchField
                    label="仕入先"
                    value={form.supplier}
                    onChange={(name) => updateField('supplier', name)}
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label={quantityInput.label}
                    placeholder={quantityInput.placeholder}
                    value={form.quantity}
                    onChange={(e) => updateField('quantity', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                {form.unit === '袋' && (
                  <>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="1袋の重量（kg）"
                        placeholder="例：20"
                        value={form.bagWeightKg}
                        onChange={(e) => updateField('bagWeightKg', e.target.value)}
                        fullWidth
                        required
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="合計重量（kg）"
                        value={calculatedTotalWeightKg}
                        helperText="袋数 × 1袋の重量"
                        fullWidth
                        InputProps={{ readOnly: true }}
                      />
                    </Grid>
                  </>
                )}

                <Grid item xs={12} md={form.unit === '袋' ? 6 : 4}>
                  <TextField
                    label="単価"
                    placeholder="例：80"
                    value={form.unitPrice}
                    onChange={(e) => updateField('unitPrice', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={form.unit === '袋' ? 6 : 4}>
                  <TextField
                    label="金額"
                    placeholder="例：40000"
                    value={form.totalPrice}
                    onChange={(e) => updateField('totalPrice', e.target.value)}
                    fullWidth
                    helperText={calculatedTotalPrice ? `計算候補：${Number(calculatedTotalPrice).toLocaleString('ja-JP')}円` : '数量 × 単価'}
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
                    placeholder="例：7月分仕入れ、母牛群へ出庫、棚卸し調整"
                    value={form.memo}
                    onChange={(e) => updateField('memo', e.target.value)}
                    fullWidth
                    multiline
                    minRows={3}
                  />
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? '登録中...' : '登録'}
                </Button>
                <Button variant="outlined" onClick={() => navigate('/feed-inventory')} disabled={saving}>
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
