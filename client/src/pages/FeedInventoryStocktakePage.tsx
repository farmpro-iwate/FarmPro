import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  createFeedInventory,
  getFeedInventoryList,
  type FeedInventoryInput,
  type FeedInventoryRecord,
} from '../services/feedInventoryApi';
import {
  feedCostQuantity,
  type FeedAllocationTargetType,
} from '../services/feedCostAllocation';
import { buildFeedCostingSnapshot } from '../services/feedCostingSnapshot';

type GroupTarget = Exclude<FeedAllocationTargetType, 'farm' | 'individual'>;

type FeedOption = {
  key: string;
  feedName: string;
  costUnit: string;
};

type MonthSummary = {
  opening: number;
  inbound: number;
  recordedOutbound: number;
  adjustments: number;
  expectedBeforeStocktake: number;
  stocktakeUsage: number;
  totalMonthlyUsage: number;
};

const groupOptions: Array<{ value: GroupTarget; label: string }> = [
  { value: 'calfGroup', label: '子牛群' },
  { value: 'growingCattleGroup', label: '育成牛群' },
  { value: 'breedingCattleGroup', label: '繁殖牛群' },
];

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function previousMonthValue() {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return { start: '', end: '' };

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const lastDay = new Date(year, monthNumber, 0).getDate();

  return {
    start: `${year}-${String(monthNumber).padStart(2, '0')}-01`,
    end: `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatQuantity(value: number, unit: string) {
  return `${value.toLocaleString('ja-JP', { maximumFractionDigits: 3 })}${unit}`;
}

function normalizedQuantity(row: FeedInventoryRecord) {
  return feedCostQuantity({
    quantity: row.quantity,
    unit: row.unit,
    bagWeightKg: row.bagWeightKg,
    totalWeightKg: row.totalWeightKg,
  });
}

function signedInventoryDelta(row: FeedInventoryRecord, costUnit: string) {
  const normalized = normalizedQuantity(row);
  if (normalized.costUnit !== costUnit) return 0;
  if (row.transactionType === '入庫') return normalized.quantity;
  if (row.transactionType === '出庫') return -normalized.quantity;
  if (row.transactionType === '調整') return normalized.quantity;
  return 0;
}

function makeFeedOptions(rows: FeedInventoryRecord[]): FeedOption[] {
  const map = new Map<string, FeedOption>();

  for (const row of rows) {
    const feedName = row.feedName.trim();
    if (!feedName) continue;
    const normalized = normalizedQuantity(row);
    const costUnit = normalized.costUnit || row.unit || 'その他';
    const key = `${feedName}\u0000${costUnit}`;
    if (!map.has(key)) map.set(key, { key, feedName, costUnit });
  }

  return Array.from(map.values()).sort((a, b) => {
    const name = a.feedName.localeCompare(b.feedName, 'ja');
    return name !== 0 ? name : a.costUnit.localeCompare(b.costUnit, 'ja');
  });
}

function summarizeMonth(
  rows: FeedInventoryRecord[],
  option: FeedOption | undefined,
  month: string,
  physicalInventory: string,
): MonthSummary | null {
  if (!option || !month || physicalInventory.trim() === '') return null;

  const actual = Number(physicalInventory);
  if (!Number.isFinite(actual) || actual < 0) return null;

  const { start, end } = monthRange(month);
  if (!start || !end) return null;

  let opening = 0;
  let inbound = 0;
  let recordedOutbound = 0;
  let adjustments = 0;

  for (const row of rows) {
    if (row.feedName.trim() !== option.feedName) continue;

    const normalized = normalizedQuantity(row);
    if (normalized.costUnit !== option.costUnit) continue;

    if (row.transactionDate < start) {
      opening += signedInventoryDelta(row, option.costUnit);
      continue;
    }

    if (row.transactionDate > end) continue;

    if (row.transactionType === '入庫') inbound += normalized.quantity;
    if (row.transactionType === '出庫') recordedOutbound += normalized.quantity;
    if (row.transactionType === '調整') adjustments += normalized.quantity;
  }

  const expectedBeforeStocktake = opening + inbound - recordedOutbound + adjustments;
  const stocktakeUsage = expectedBeforeStocktake - actual;
  const totalMonthlyUsage = recordedOutbound + Math.max(0, stocktakeUsage);

  return {
    opening,
    inbound,
    recordedOutbound,
    adjustments,
    expectedBeforeStocktake,
    stocktakeUsage,
    totalMonthlyUsage,
  };
}

export function FeedInventoryStocktakePage() {
  const [rows, setRows] = useState<FeedInventoryRecord[]>([]);
  const [month, setMonth] = useState(previousMonthValue());
  const [feedKey, setFeedKey] = useState('');
  const [physicalInventory, setPhysicalInventory] = useState('');
  const [groupQuantities, setGroupQuantities] = useState<Record<GroupTarget, string>>({
    calfGroup: '',
    growingCattleGroup: '',
    breedingCattleGroup: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getFeedInventoryList();
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料在庫記録を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const options = useMemo(() => makeFeedOptions(rows), [rows]);
  const selected = options.find((item) => item.key === feedKey);
  const summary = useMemo(
    () => summarizeMonth(rows, selected, month, physicalInventory),
    [rows, selected, month, physicalInventory],
  );

  const groupTotal = useMemo(
    () => groupOptions.reduce((sum, item) => sum + numberValue(groupQuantities[item.value]), 0),
    [groupQuantities],
  );

  const usageToAllocate = summary && summary.stocktakeUsage > 0 ? summary.stocktakeUsage : 0;
  const allocationMatches = Math.abs(groupTotal - usageToAllocate) <= 0.001;
  const { end: monthEnd } = monthRange(month);

  function updateGroup(target: GroupTarget, value: string) {
    setGroupQuantities((current) => ({ ...current, [target]: value }));
    setError('');
    setSuccess('');
  }

  async function confirmStocktake() {
    if (!selected || !summary || !monthEnd) {
      setError('棚卸する月・飼料・月末実在庫を入力してください。');
      return;
    }

    if (summary.stocktakeUsage < -0.001) {
      setError('月末実在庫が帳簿上の在庫より多いため、先に未登録の入庫または在庫調整を確認してください。');
      return;
    }

    if (usageToAllocate <= 0.001) {
      setSuccess('追加で記録する使用量はありません。月末実在庫と帳簿在庫は一致しています。');
      return;
    }

    if (!allocationMatches) {
      setError(`牛群別の合計を棚卸で確定する使用量 ${formatQuantity(usageToAllocate, selected.costUnit)} に合わせてください。`);
      return;
    }

    const targets = groupOptions
      .map((item) => ({ ...item, quantity: numberValue(groupQuantities[item.value]) }))
      .filter((item) => item.quantity > 0);

    if (targets.length === 0) {
      setError('使用した牛群の数量を入力してください。');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const prepared: FeedInventoryInput[] = [];

      // Validate every selected group before writing anything. This prevents a partial
      // stocktake when one group has no eligible cattle to allocate the usage to.
      for (const target of targets) {
        const input: FeedInventoryInput = {
          transactionDate: monthEnd,
          feedName: selected.feedName,
          transactionType: '出庫',
          quantity: String(target.quantity),
          unit: selected.costUnit,
          bagWeightKg: '',
          totalWeightKg: '',
          unitPrice: '',
          totalPrice: '',
          supplier: '',
          taxExcludedPrice: '',
          taxAmount: '',
          memo: `月末棚卸 ${month}｜${target.label}｜月末実在庫 ${formatQuantity(Number(physicalInventory), selected.costUnit)}`,
        };

        const costing = await buildFeedCostingSnapshot(input, target.value);
        input.costing = costing;
        input.unitPrice = String(costing.averageUnitCost);
        input.totalPrice = String(costing.usedCost);
        prepared.push(input);
      }

      for (const input of prepared) {
        await createFeedInventory(input);
      }

      await load();
      setSuccess(`${month}の棚卸を確定しました。未記録使用量 ${formatQuantity(usageToAllocate, selected.costUnit)} を牛群別の飼料使用として記録しました。`);
      setPhysicalInventory('');
      setGroupQuantities({
        calfGroup: '',
        growingCattleGroup: '',
        breedingCattleGroup: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '棚卸を確定できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={800}>飼料在庫 月末棚卸</Typography>
          <Typography variant="body2" color="text.secondary">牛群管理の未記録使用量を月末在庫から確定します。</Typography>
        </Box>
        <Button component={RouterLink} to="/feed-inventory" variant="outlined">在庫管理へ戻る</Button>
      </Stack>

      <Alert severity="info">
        個別管理は従来どおり「飼料を使用」で個体へ直接記録します。牛群管理は、この棚卸で月末実在庫との差から未記録使用量を確定し、牛群へ配賦します。
      </Alert>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={800} sx={{ mb: 1.5 }}>1. 月末実在庫を入力</Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={4}>
              <TextField
                label="棚卸月"
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setError('');
                  setSuccess('');
                }}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                select
                label="飼料"
                value={feedKey}
                onChange={(e) => {
                  setFeedKey(e.target.value);
                  setPhysicalInventory('');
                  setGroupQuantities({ calfGroup: '', growingCattleGroup: '', breedingCattleGroup: '' });
                  setError('');
                  setSuccess('');
                }}
                fullWidth
                disabled={loading}
              >
                <MenuItem value="">選択してください</MenuItem>
                {options.map((item) => (
                  <MenuItem key={item.key} value={item.key}>{item.feedName}（{item.costUnit}）</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label={selected ? `月末実在庫（${selected.costUnit}）` : '月末実在庫'}
                value={physicalInventory}
                onChange={(e) => {
                  setPhysicalInventory(e.target.value);
                  setError('');
                  setSuccess('');
                }}
                type="number"
                inputProps={{ min: 0, step: 'any' }}
                fullWidth
                disabled={!selected}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {summary && selected && (
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 1.5 }}>2. 使用量を確認</Typography>
            <Grid container spacing={1}>
              <Grid item xs={6} md={2.4}>
                <Typography variant="caption" color="text.secondary">月初在庫</Typography>
                <Typography fontWeight={800}>{formatQuantity(summary.opening, selected.costUnit)}</Typography>
              </Grid>
              <Grid item xs={6} md={2.4}>
                <Typography variant="caption" color="text.secondary">当月入庫</Typography>
                <Typography fontWeight={800}>{formatQuantity(summary.inbound, selected.costUnit)}</Typography>
              </Grid>
              <Grid item xs={6} md={2.4}>
                <Typography variant="caption" color="text.secondary">記録済み使用</Typography>
                <Typography fontWeight={800}>{formatQuantity(summary.recordedOutbound, selected.costUnit)}</Typography>
              </Grid>
              <Grid item xs={6} md={2.4}>
                <Typography variant="caption" color="text.secondary">その他調整</Typography>
                <Typography fontWeight={800}>{formatQuantity(summary.adjustments, selected.costUnit)}</Typography>
              </Grid>
              <Grid item xs={12} md={2.4}>
                <Typography variant="caption" color="text.secondary">棚卸で追加する使用量</Typography>
                <Typography fontWeight={900} color={summary.stocktakeUsage < -0.001 ? 'error.main' : 'primary.main'}>
                  {formatQuantity(summary.stocktakeUsage, selected.costUnit)}
                </Typography>
              </Grid>
            </Grid>

            <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary">
                月初在庫 ＋ 当月入庫 ＋ 調整 － 記録済み使用 － 月末実在庫 ＝ 棚卸で追加する使用量
              </Typography>
              <Typography fontWeight={800} sx={{ mt: 0.5 }}>
                確定後の当月使用量：{formatQuantity(summary.totalMonthlyUsage, selected.costUnit)}
              </Typography>
            </Box>

            {summary.stocktakeUsage < -0.001 && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                実在庫が帳簿在庫を {formatQuantity(Math.abs(summary.stocktakeUsage), selected.costUnit)} 上回っています。未登録の入庫などを確認してから棚卸を確定してください。
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {summary && selected && usageToAllocate > 0.001 && (
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={800}>3. 使用した牛群へ分ける</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              合計が {formatQuantity(usageToAllocate, selected.costUnit)} になるよう入力してください。同じ飼料を複数群で使った場合も分けて記録できます。
            </Typography>

            <Grid container spacing={1.5}>
              {groupOptions.map((item) => (
                <Grid item xs={12} sm={4} key={item.value}>
                  <TextField
                    label={`${item.label}（${selected.costUnit}）`}
                    value={groupQuantities[item.value]}
                    onChange={(e) => updateGroup(item.value, e.target.value)}
                    type="number"
                    inputProps={{ min: 0, step: 'any' }}
                    fullWidth
                  />
                </Grid>
              ))}
            </Grid>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mt: 1.5 }}>
              <Typography fontWeight={800} sx={{ flexGrow: 1 }}>
                牛群別合計：{formatQuantity(groupTotal, selected.costUnit)}
              </Typography>
              <Typography color={allocationMatches ? 'success.main' : 'text.secondary'} fontWeight={700}>
                {allocationMatches ? '使用量と一致' : `残り ${formatQuantity(usageToAllocate - groupTotal, selected.costUnit)}`}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          onClick={() => void confirmStocktake()}
          disabled={saving || !selected || !summary || summary.stocktakeUsage < -0.001 || (usageToAllocate > 0.001 && !allocationMatches)}
        >
          {saving ? '確定中...' : '棚卸を確定'}
        </Button>
        <Button component={RouterLink} to="/feed-inventory" variant="outlined" disabled={saving}>
          キャンセル
        </Button>
      </Stack>
    </Stack>
  );
}
