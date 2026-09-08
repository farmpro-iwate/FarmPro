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
import {
  type FeedAllocationTargetType
} from '../services/feedCostAllocation';
import { buildFeedCostingSnapshot } from '../services/feedCostingSnapshot';
import { FeedSearchField } from '../components/FeedSearchField';
import { PartnerSearchField } from '../components/PartnerSearchField';

const allocationTargetOptions: Array<{ value: FeedAllocationTargetType; label: string }> = [
  { value: 'farm', label: '農場全体' },
  { value: 'calfGroup', label: '子牛群' },
  { value: 'growingCattleGroup', label: '育成牛群' },
  { value: 'breedingCattleGroup', label: '繁殖牛群' },
];

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
  const [allocationTarget, setAllocationTarget] = useState<FeedAllocationTargetType>('farm');
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
        飼料在庫 新規登録
      </Typography>

      <Alert severity="info">
        飼料の入庫・出庫・調整を記録します。出庫では使用先を選ぶと、在庫原価を自動計算して個体へ按分します。
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
                    disabled={form.transactionType === '出庫'}
                    helperText={form.transactionType === '出庫' ? '在庫の移動平均原価から自動計算します' : ''}
                  />
                </Grid>

                <Grid item xs={12} md={form.unit === '袋' ? 6 : 4}>
                  <TextField
                    label="金額"
                    placeholder="例：40000"
                    value={form.totalPrice || calculatedTotalPrice}
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
