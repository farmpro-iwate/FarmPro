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
  emptyFeedInventoryInput,
  FeedInventoryInput,
  feedInventoryTransactionTypeOptions,
  feedInventoryUnitOptions,
  getFeedInventory,
  recordToInput,
  updateFeedInventory
} from '../services/feedInventoryApi';
import { getFarmSettings } from '../services/settingsApi';
import type { FarmTaxRate } from '../types/settings';
import { FeedSearchField } from '../components/FeedSearchField';
import { PartnerSearchField } from '../components/PartnerSearchField';

const taxRateOptions: Array<{ value: FarmTaxRate; label: string }> = [
  { value: '10', label: '10%' },
  { value: '8', label: '8%' },
  { value: '0', label: '非課税' },
];

function numberValue(valueText: string) {
  const n = Number(valueText);
  return Number.isNaN(n) ? 0 : n;
}

function quantityField(unit: string) {
  if (unit === 'kg') return '重量（kg）';
  if (unit === '袋') return '袋数';
  if (unit === 'ロール') return 'ロール数';
  if (unit === '束') return '束数';
  if (unit === '個') return '個数';
  return '数量';
}

function calculateTaxBreakdown(totalPriceText: string, taxRate?: FarmTaxRate) {
  const totalPrice = Number(totalPriceText);
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
    return { taxExcludedPrice: '', taxAmount: '' };
  }

  if (taxRate === '0') {
    const rounded = String(Math.round(totalPrice));
    return { taxExcludedPrice: rounded, taxAmount: '0' };
  }

  const rate = taxRate === '8' ? 0.08 : 0.10;
  const taxExcludedPrice = Math.round(totalPrice / (1 + rate));
  const taxAmount = Math.round(totalPrice - taxExcludedPrice);
  return {
    taxExcludedPrice: String(taxExcludedPrice),
    taxAmount: String(taxAmount),
  };
}

export function FeedInventoryEditForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<FeedInventoryInput>(emptyFeedInventoryInput);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [totalPriceEdited, setTotalPriceEdited] = useState(false);

  function updateField<K extends keyof FeedInventoryInput>(key: K, value: FeedInventoryInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const calculatedTotalPrice = useMemo(() => {
    const quantity = numberValue(form.quantity);
    const unitPrice = numberValue(form.unitPrice);
    if (quantity <= 0 || unitPrice <= 0) return '';
    return String(Math.round(quantity * unitPrice));
  }, [form.quantity, form.unitPrice]);

  const effectiveTotalPrice = totalPriceEdited ? form.totalPrice : calculatedTotalPrice || form.totalPrice;

  const calculatedTax = useMemo(() => {
    if (form.transactionType !== '入庫') {
      return { taxExcludedPrice: '', taxAmount: '' };
    }
    return calculateTaxBreakdown(effectiveTotalPrice, form.taxRate || '10');
  }, [form.transactionType, form.taxRate, effectiveTotalPrice]);

  const calculatedTotalWeightKg = useMemo(() => {
    if (form.unit !== '袋') return '';
    const bags = numberValue(form.quantity);
    const weightPerBag = numberValue(form.bagWeightKg);
    if (bags <= 0 || weightPerBag <= 0) return '';
    return String(bags * weightPerBag);
  }, [form.unit, form.quantity, form.bagWeightKg]);

  useEffect(() => {
    async function load() {
      if (!id) {
        setError('飼料在庫IDがありません。');
        setLoading(false);
        return;
      }

      try {
        const [record, settings] = await Promise.all([
          getFeedInventory(id),
          getFarmSettings().catch(() => null),
        ]);
        const input = recordToInput(record);
        if (input.transactionType === '入庫' && !input.taxRate) {
          input.taxRate = settings?.defaultTaxRate || '10';
        }
        if (input.transactionType === '入庫' && (!input.taxExcludedPrice || !input.taxAmount)) {
          const breakdown = calculateTaxBreakdown(input.totalPrice, input.taxRate || '10');
          input.taxExcludedPrice = breakdown.taxExcludedPrice;
          input.taxAmount = breakdown.taxAmount;
        }
        setForm(input);
        setTotalPriceEdited(false);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '飼料在庫記録を取得できませんでした。');
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
      setError('飼料在庫IDがありません。');
      return;
    }
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
    if (effectiveTotalPrice && Number.isNaN(Number(effectiveTotalPrice))) {
      setError('金額は数字で入力してください。例：40000');
      return;
    }

    const submitData: FeedInventoryInput = {
      ...form,
      taxRate: form.transactionType === '入庫' ? (form.taxRate || '10') : undefined,
      taxExcludedPrice: form.transactionType === '入庫' ? calculatedTax.taxExcludedPrice : '',
      taxAmount: form.transactionType === '入庫' ? calculatedTax.taxAmount : '',
      totalWeightKg: form.unit === '袋' ? calculatedTotalWeightKg : '',
      totalPrice: effectiveTotalPrice,
    };

    setSaving(true);
    try {
      await updateFeedInventory(id, submitData);
      navigate('/feed-inventory');
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料在庫記録を更新できませんでした。');
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
        飼料在庫 編集
      </Typography>

      <Alert severity="info">
        登録済みの飼料在庫記録を修正できます。入庫の金額は税込で入力し、原価は税抜で計算します。
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
                    label={quantityField(form.unit)}
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
                    label={form.transactionType === '入庫' ? '単価（税込）' : '単価'}
                    value={form.unitPrice}
                    onChange={(e) => updateField('unitPrice', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={form.unit === '袋' ? 6 : 4}>
                  <TextField
                    label={form.transactionType === '入庫' ? '金額（税込）' : '金額'}
                    value={effectiveTotalPrice}
                    onChange={(e) => {
                      setTotalPriceEdited(true);
                      updateField('totalPrice', e.target.value);
                    }}
                    fullWidth
                    helperText={calculatedTotalPrice ? '数量 × 単価で自動計算。必要な場合は修正できます' : '数量 × 単価'}
                  />
                </Grid>

                {form.transactionType === '入庫' && (
                  <>
                    <Grid item xs={12} md={4}>
                      <TextField
                        select
                        label="消費税率"
                        value={form.taxRate || '10'}
                        onChange={(e) => updateField('taxRate', e.target.value as FarmTaxRate)}
                        fullWidth
                        helperText="未設定の既存記録は農場設定の基本税率を表示します"
                      >
                        {taxRateOptions.map((item) => (
                          <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="税抜金額"
                        value={calculatedTax.taxExcludedPrice}
                        fullWidth
                        InputProps={{ readOnly: true }}
                        helperText="在庫原価に使用します"
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="消費税額"
                        value={calculatedTax.taxAmount}
                        fullWidth
                        InputProps={{ readOnly: true }}
                      />
                    </Grid>
                  </>
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

              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? '更新中...' : '更新'}
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
