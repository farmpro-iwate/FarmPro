import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import {
  type FeedAllocationTargetType
} from '../services/feedCostAllocation';
import { buildFeedCostingSnapshot } from '../services/feedCostingSnapshot';
import { getFarmSettings } from '../services/settingsApi';
import type { FarmTaxRate } from '../types/settings';
import { FeedSearchField } from '../components/FeedSearchField';
import { PartnerSearchField } from '../components/PartnerSearchField';

const allocationTargetOptions: Array<{ value: FeedAllocationTargetType; label: string }> = [
  { value: 'farm', label: '農場全体' },
  { value: 'calfGroup', label: '子牛群' },
  { value: 'growingCattleGroup', label: '育成牛群' },
  { value: 'breedingCattleGroup', label: '繁殖牛群' },
];

const taxRateOptions: Array<{ value: FarmTaxRate; label: string }> = [
  { value: '10', label: '10%' },
  { value: '8', label: '8%' },
  { value: '0', label: '非課税' },
];

function numberValue(valueText: string) {
  const n = Number(valueText);
  return Number.isNaN(n) ? 0 : n;
}

function todayDateValue() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function FeedInventoryForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const useMode = searchParams.get('mode') === 'use';
  const [form, setForm] = useState<FeedInventoryInput>(() => {
    if (!useMode) return emptyFeedInventoryInput;

    return {
      ...emptyFeedInventoryInput,
      transactionDate: todayDateValue(),
      transactionType: '出庫',
      feedName: searchParams.get('feedName') || '',
      unit: searchParams.get('unit') || 'kg',
      bagWeightKg: searchParams.get('bagWeightKg') || '',
      supplier: searchParams.get('supplier') || '',
    };
  });
  const [allocationTarget, setAllocationTarget] = useState<FeedAllocationTargetType>('farm');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (useMode) return;

    getFarmSettings()
      .then((settings) => {
        const defaultTaxRate = settings.defaultTaxRate || '10';
        setForm((prev) => ({
          ...prev,
          taxRate: prev.taxRate || defaultTaxRate,
        }));
      })
      .catch((err) => {
        console.warn('基本消費税率の読み込みをスキップしました。', err);
        setForm((prev) => ({ ...prev, taxRate: prev.taxRate || '10' }));
      });
  }, [useMode]);

  function updateField<K extends keyof FeedInventoryInput>(key: K, value: FeedInventoryInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const calculatedTotalPrice = useMemo(() => {
    const quantity = numberValue(form.quantity);
    const unitPrice = numberValue(form.unitPrice);
    if (quantity <= 0 || unitPrice <= 0) return '';
    return String(Math.round(quantity * unitPrice));
  }, [form.quantity, form.unitPrice]);

  const displayedTotalPrice = form.totalPrice || calculatedTotalPrice;

  const taxBreakdown = useMemo(() => {
    if (form.transactionType !== '入庫') {
      return { taxExcludedPrice: '', taxAmount: '' };
    }

    const grossPrice = numberValue(displayedTotalPrice);
    if (grossPrice <= 0) {
      return { taxExcludedPrice: '', taxAmount: '' };
    }

    const taxRate = form.taxRate || '10';
    if (taxRate === '0') {
      const price = String(Math.round(grossPrice));
      return { taxExcludedPrice: price, taxAmount: '0' };
    }

    const rate = Number(taxRate) / 100;
    const taxExcludedPrice = Math.round(grossPrice / (1 + rate));
    const taxAmount = Math.round(grossPrice - taxExcludedPrice);

    return {
      taxExcludedPrice: String(taxExcludedPrice),
      taxAmount: String(taxAmount),
    };
  }, [displayedTotalPrice, form.taxRate, form.transactionType]);

  const calculatedTotalWeightKg = useMemo(() => {
    if (form.unit !== '袋') return '';
    const bags = numberValue(form.quantity);
    const weightPerBag = numberValue(form.bagWeightKg);
    if (bags <= 0 || weightPerBag <= 0) return '';
    return String(bags * weightPerBag);
  }, [form.unit, form.quantity, form.bagWeightKg]);

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
      setError('数量は数字で入力してください。例：10');
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
      taxRate: form.transactionType === '入庫' ? (form.taxRate || '10') : undefined,
      taxExcludedPrice: form.transactionType === '入庫' ? taxBreakdown.taxExcludedPrice : '',
      taxAmount: form.transactionType === '入庫' ? taxBreakdown.taxAmount : '',
      totalWeightKg: form.unit === '袋' ? calculatedTotalWeightKg : '',
      totalPrice: displayedTotalPrice
    };

    setSaving(true);
    try {
      if (submitData.transactionType === '出庫') {
        const costing = await buildFeedCostingSnapshot(submitData, allocationTarget);
        submitData.costing = costing;
        submitData.unitPrice = String(costing.averageUnitCost);
        submitData.totalPrice = String(costing.usedCost);
      }

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
        {useMode ? '飼料を使用' : '飼料在庫 新規登録'}
      </Typography>

      <Alert severity="info">
        {useMode
          ? '使用先と数量を選んで記録します。単価と金額は在庫原価から自動計算します。'
          : '飼料の入庫・出庫・調整を記録します。入庫の金額は税込で入力し、原価は税抜で計算します。'}
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

                {!useMode && (
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
                )}

                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="単位"
                    value={form.unit}
                    onChange={(e) => updateField('unit', e.target.value)}
                    fullWidth
                    disabled={useMode && Boolean(searchParams.get('unit'))}
                  >
                    {feedInventoryUnitOptions.map((item) => (
                      <MenuItem key={item} value={item}>{item}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                {form.transactionType === '出庫' && (
                  <Grid item xs={12}>
                    <TextField
                      select
                      label="使用先"
                      value={allocationTarget}
                      onChange={(e) => setAllocationTarget(e.target.value as FeedAllocationTargetType)}
                      fullWidth
                      helperText="群を選ぶと、その日の対象牛を自動取得して原価を按分します。"
                    >
                      {allocationTargetOptions.map((item) => (
                        <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                )}

                <Grid item xs={12} md={6}>
                  <FeedSearchField
                    value={form.feedName}
                    onChange={(name) => updateField('feedName', name)}
                    required
                  />
                </Grid>

                {!useMode && (
                  <Grid item xs={12} md={6}>
                    <PartnerSearchField
                      label="仕入先"
                      value={form.supplier}
                      onChange={(name) => updateField('supplier', name)}
                    />
                  </Grid>
                )}

                <Grid item xs={12} md={4}>
                  <TextField
                    label="数量"
                    placeholder="例：10"
                    value={form.quantity}
                    onChange={(e) => updateField('quantity', e.target.value)}
                    fullWidth
                    required
                    helperText={form.unit ? `単位：${form.unit}` : ''}
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

                {!useMode && (
                  <>
                    <Grid item xs={12} md={form.unit === '袋' ? 6 : 4}>
                      <TextField
                        label={form.transactionType === '入庫' ? '単価（税込）' : '単価'}
                        placeholder="例：80"
                        value={form.unitPrice}
                        onChange={(e) => updateField('unitPrice', e.target.value)}
                        fullWidth
                        disabled={form.transactionType === '出庫'}
                        helperText={form.transactionType === '出庫' ? '在庫の移動平均原価から自動計算します' : ''}
                      />
                    </Grid>

                    <Grid item xs={12} md={form.unit === '袋' ? 6 : 4}>
                      <TextField
                        label={form.transactionType === '入庫' ? '金額（税込）' : '金額'}
                        placeholder="例：40000"
                        value={displayedTotalPrice}
                        onChange={(e) => updateField('totalPrice', e.target.value)}
                        fullWidth
                        disabled={form.transactionType === '出庫'}
                        helperText={form.transactionType === '出庫'
                          ? '出庫量 × 移動平均原価で自動計算します'
                          : calculatedTotalPrice
                            ? '数量 × 単価で自動計算。必要な場合は修正できます'
                            : '数量 × 単価'}
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
                            helperText="設定の基本消費税率を初期表示します"
                          >
                            {taxRateOptions.map((item) => (
                              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField
                            label="税抜金額"
                            value={taxBreakdown.taxExcludedPrice}
                            fullWidth
                            InputProps={{ readOnly: true }}
                            helperText="在庫原価に使用します"
                          />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField
                            label="消費税額"
                            value={taxBreakdown.taxAmount}
                            fullWidth
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                      </>
                    )}
                  </>
                )}

                <Grid item xs={12}>
                  <TextField
                    label="メモ"
                    placeholder="例：7月分仕入れ、母牛群へ出庫、棚卸し調整"
                    value={form.memo}
                    onChange={(e) => updateField('memo', e.target.value)}
                    fullWidth
                    multiline
                    minRows={useMode ? 2 : 3}
                  />
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? '登録中...' : useMode ? '使用を記録' : '登録'}
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
