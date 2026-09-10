import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  TextField,
  Typography
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  createFeedInventory,
  deleteFeedInventory,
  FeedInventoryRecord,
  feedInventoryTransactionTypeOptions,
  feedInventoryUnitOptions,
  getFeedInventoryList,
  updateFeedInventoryCosting
} from '../services/feedInventoryApi';
import {
  allocateByWeight,
  calfAgeWeight,
  defaultCalfAgeWeightSettings,
  type CalfAgeWeightSettings,
  type FeedCostAllocationItem,
} from '../services/feedCostAllocation';

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function rawValue(v: unknown) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function numberValue(valueText: string) {
  const n = Number(valueText);
  return Number.isNaN(n) ? 0 : n;
}

function canUseFeedRow(row: FeedInventoryRecord) {
  return row.transactionType === '入庫';
}

function canManageIndividualQuantity(row: FeedInventoryRecord) {
  return row.transactionType === '出庫' && Boolean(row.costing?.allocations?.length);
}

function formatAllocationNumber(value: number) {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: 3 });
}

function feedUsePath(row: FeedInventoryRecord) {
  const params = new URLSearchParams({
    mode: 'use',
    feedName: row.feedName || '',
    unit: row.unit || 'kg',
  });
  if (row.bagWeightKg) params.set('bagWeightKg', row.bagWeightKg);
  if (row.supplier) params.set('supplier', row.supplier);
  return `/feed-inventory/new?${params.toString()}`;
}

type KgInventoryStatus = {
  key: string;
  feedName: string;
  quantity: number;
  supplier: string;
};

type BagInventoryStatus = {
  key: string;
  feedName: string;
  bagWeightKg: string;
  quantity: number;
  totalWeightKg: number;
  supplier: string;
};

type RollInventoryStatus = {
  key: string;
  feedName: string;
  quantity: number;
  supplier: string;
};

type CountInventoryStatus = {
  key: string;
  feedName: string;
  unit: '束' | '個';
  quantity: number;
  supplier: string;
};

function kgInventoryByFeed(rows: FeedInventoryRecord[]): KgInventoryStatus[] {
  const groups = new Map<string, KgInventoryStatus>();
  for (const row of rows) {
    if (row.unit !== 'kg') continue;
    const key = `kg\u0000${row.feedName}`;
    const current = groups.get(key) || {
      key,
      feedName: row.feedName || '名称未登録',
      quantity: 0,
      supplier: row.supplier || '',
    };
    const direction = row.transactionType === '入庫' ? 1 : row.transactionType === '出庫' ? -1 : row.transactionType === '調整' ? 1 : 0;
    current.quantity += direction * numberValue(row.quantity);
    if (!current.supplier && row.supplier) current.supplier = row.supplier;
    groups.set(key, current);
  }
  return Array.from(groups.values()).sort((a, b) => a.feedName.localeCompare(b.feedName, 'ja'));
}

function bagInventoryByFeed(rows: FeedInventoryRecord[]): BagInventoryStatus[] {
  const groups = new Map<string, BagInventoryStatus>();
  for (const row of rows) {
    if (row.unit !== '袋') continue;
    const bagWeightKg = row.bagWeightKg || '';
    const key = `袋\u0000${row.feedName}\u0000${bagWeightKg}`;
    const current = groups.get(key) || {
      key,
      feedName: row.feedName || '名称未登録',
      bagWeightKg,
      quantity: 0,
      totalWeightKg: 0,
      supplier: row.supplier || '',
    };
    const direction = row.transactionType === '入庫' ? 1 : row.transactionType === '出庫' ? -1 : row.transactionType === '調整' ? 1 : 0;
    current.quantity += direction * numberValue(row.quantity);
    current.totalWeightKg += direction * numberValue(row.totalWeightKg);
    if (!current.supplier && row.supplier) current.supplier = row.supplier;
    groups.set(key, current);
  }
  return Array.from(groups.values()).sort((a, b) => a.feedName.localeCompare(b.feedName, 'ja'));
}

function rollInventoryByFeed(rows: FeedInventoryRecord[]): RollInventoryStatus[] {
  const groups = new Map<string, RollInventoryStatus>();
  for (const row of rows) {
    if (row.unit !== 'ロール') continue;
    const key = `ロール\u0000${row.feedName}`;
    const current = groups.get(key) || { key, feedName: row.feedName || '名称未登録', quantity: 0, supplier: row.supplier || '' };
    const direction = row.transactionType === '入庫' ? 1 : row.transactionType === '出庫' ? -1 : row.transactionType === '調整' ? 1 : 0;
    current.quantity += direction * numberValue(row.quantity);
    if (!current.supplier && row.supplier) current.supplier = row.supplier;
    groups.set(key, current);
  }
  return Array.from(groups.values()).sort((a, b) => a.feedName.localeCompare(b.feedName, 'ja'));
}

function countInventoryByFeed(rows: FeedInventoryRecord[]): CountInventoryStatus[] {
  const groups = new Map<string, CountInventoryStatus>();
  for (const row of rows) {
    if (row.unit !== '束' && row.unit !== '個') continue;
    const key = `${row.unit}\u0000${row.feedName}`;
    const current = groups.get(key) || { key, feedName: row.feedName || '名称未登録', unit: row.unit, quantity: 0, supplier: row.supplier || '' };
    const direction = row.transactionType === '入庫' ? 1 : row.transactionType === '出庫' ? -1 : row.transactionType === '調整' ? 1 : 0;
    current.quantity += direction * numberValue(row.quantity);
    if (!current.supplier && row.supplier) current.supplier = row.supplier;
    groups.set(key, current);
  }
  return Array.from(groups.values()).sort((a, b) => a.feedName.localeCompare(b.feedName, 'ja'));
}

function yen(valueText: string) {
  const n = Number(valueText);
  if (Number.isNaN(n) || valueText === '') return '-';
  return `${Math.round(n).toLocaleString('ja-JP')}円`;
}

function quantityWithUnit(quantity: string, unit: string) {
  if (!quantity) return '-';
  const n = Number(quantity);
  if (Number.isNaN(n)) return `${quantity}${unit || ''}`;
  return `${n.toLocaleString('ja-JP')}${unit || ''}`;
}

function inventoryQuantity(row: FeedInventoryRecord) {
  const quantity = quantityWithUnit(row.quantity, row.unit);
  if (row.unit !== '袋' || !row.totalWeightKg) return quantity;
  return `${quantity}（${numberValue(row.totalWeightKg).toLocaleString('ja-JP')}kg）`;
}

function transactionColor(transactionType: string) {
  if (transactionType === '入庫') return 'success';
  if (transactionType === '出庫') return 'warning';
  if (transactionType === '調整') return 'info';
  return 'default';
}

function isDateInRange(dateText: string, startDate: string, endDate: string) {
  if (!dateText) return false;
  if (startDate && dateText < startDate) return false;
  if (endDate && dateText > endDate) return false;
  return true;
}

function csvEscape(valueText: string) {
  const escaped = valueText.replace(/"/g, '""');
  return `"${escaped}"`;
}

function todayText() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function todayDateValue() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function downloadFeedInventoryCsv(rows: FeedInventoryRecord[]) {
  const headers = ['入出庫日', '飼料名', '区分', '数量', '単位', '1袋重量kg', '合計重量kg', '単価', '金額', '仕入先', 'メモ', '作成日時', '更新日時'];
  const body = rows.map((row) => [row.transactionDate, row.feedName, row.transactionType, row.quantity, row.unit, row.bagWeightKg, row.totalWeightKg, row.unitPrice, row.totalPrice, row.supplier, row.memo, row.createdAt, row.updatedAt]);
  const lines = [headers.map(csvEscape).join(','), ...body.map((line) => line.map((item) => csvEscape(rawValue(item))).join(','))];
  const csv = '\ufeff' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `farmpro_feed_inventory_${todayText()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function inferredAgeDays(item: FeedCostAllocationItem) {
  if (typeof item.ageDays === 'number') return item.ageDays;
  if (item.weight <= 1) return 15;
  if (item.weight <= 2) return 45;
  if (item.weight <= 3) return 75;
  return 91;
}

export function FeedInventoryList() {
  const [rows, setRows] = useState<FeedInventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [quickUsingKey, setQuickUsingKey] = useState('');
  const [mobileMenuAnchor, setMobileMenuAnchor] = useState<null | HTMLElement>(null);
  const [mobileMenuRow, setMobileMenuRow] = useState<FeedInventoryRecord | null>(null);
  const [allocationRow, setAllocationRow] = useState<FeedInventoryRecord | null>(null);
  const [allocationDraft, setAllocationDraft] = useState<Record<string, string>>({});
  const [ageSettingsDraft, setAgeSettingsDraft] = useState<CalfAgeWeightSettings>({ ...defaultCalfAgeWeightSettings });
  const [allocationSaving, setAllocationSaving] = useState(false);
  const [allocationError, setAllocationError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  async function loadInventory() {
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

  useEffect(() => { loadInventory(); }, []);

  async function handleDelete(row: FeedInventoryRecord) {
    const ok = window.confirm(`この飼料在庫記録を削除しますか？\n\n入出庫日：${row.transactionDate || '-'}\n飼料名：${row.feedName || '-'}\n区分：${row.transactionType || '-'}`);
    if (!ok) return;
    setDeletingId(row.id);
    setError('');
    setSuccess('');
    try {
      await deleteFeedInventory(row.id);
      setSuccess('飼料在庫記録を削除しました。');
      await loadInventory();
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料在庫記録を削除できませんでした。');
    } finally {
      setDeletingId('');
    }
  }

  function openMobileMenu(anchor: HTMLElement, row: FeedInventoryRecord) { setMobileMenuAnchor(anchor); setMobileMenuRow(row); }
  function closeMobileMenu() { setMobileMenuAnchor(null); setMobileMenuRow(null); }

  function openAllocation(row: FeedInventoryRecord) {
    if (!row.costing) return;
    setAllocationRow(row);
    setAllocationError('');
    setAgeSettingsDraft({ ...(row.costing.ageWeightSettings || defaultCalfAgeWeightSettings) });
    setAllocationDraft(Object.fromEntries(row.costing.allocations.map((item) => [item.animalId, String(item.allocatedQuantity)])));
  }

  function closeAllocation() {
    if (allocationSaving) return;
    setAllocationRow(null);
    setAllocationDraft({});
    setAllocationError('');
  }

  function recalculateByAge(settings: CalfAgeWeightSettings) {
    const costing = allocationRow?.costing;
    if (!costing) return;
    const weighted = costing.allocations.map((item) => ({
      ...item,
      ageDays: inferredAgeDays(item),
      weight: calfAgeWeight(inferredAgeDays(item), settings),
    }));
    const recalculated = allocateByWeight(weighted, costing.usedQuantity, costing.usedCost);
    setAllocationDraft(Object.fromEntries(recalculated.map((item) => [item.animalId, String(item.allocatedQuantity)])));
  }

  function updateAgeSetting(key: keyof CalfAgeWeightSettings, raw: string) {
    const n = Number(raw);
    const next = { ...ageSettingsDraft, [key]: Number.isFinite(n) && n >= 0 ? n : 0 };
    setAgeSettingsDraft(next);
    setAllocationError('');
    recalculateByAge(next);
  }

  const allocationDraftTotal = useMemo(() => {
    if (!allocationRow?.costing) return 0;
    return allocationRow.costing.allocations.reduce((sum, item) => {
      const n = Number((allocationDraft[item.animalId] ?? '').trim());
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [allocationRow, allocationDraft]);

  async function saveAllocation() {
    const row = allocationRow;
    const costing = row?.costing;
    if (!row || !costing) return;

    const parsed = costing.allocations.map((item) => {
      const n = Number((allocationDraft[item.animalId] ?? '').trim());
      return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
    });
    if (parsed.some((n) => Number.isNaN(n))) {
      setAllocationError('各個体の給与量は0以上の数字で入力してください。');
      return;
    }

    const total = parsed.reduce((sum, n) => sum + n, 0);
    if (Math.abs(total - costing.usedQuantity) > 0.001) {
      setAllocationError(`個体別給与量合計を出庫数量 ${formatAllocationNumber(costing.usedQuantity)}${costing.costUnit} と一致させてください。`);
      return;
    }

    const allocations = costing.allocations.map((item, index) => {
      const ageDays = inferredAgeDays(item);
      const quantity = parsed[index];
      return {
        ...item,
        ageDays,
        weight: costing.targetType === 'calfGroup' ? calfAgeWeight(ageDays, ageSettingsDraft) : item.weight,
        allocatedQuantity: quantity,
        allocatedCost: quantity * costing.averageUnitCost,
      };
    });

    setAllocationSaving(true);
    setAllocationError('');
    try {
      const saved = await updateFeedInventoryCosting(row.id, {
        ...costing,
        allocationMethod: costing.targetType === 'calfGroup' ? 'calfAgeWeighted' : costing.allocationMethod,
        allocations,
        ageWeightSettings: costing.targetType === 'calfGroup' ? { ...ageSettingsDraft } : costing.ageWeightSettings,
        calculatedAt: new Date().toISOString(),
      });
      setRows((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSuccess('個体別給与量を保存しました。');
      setAllocationRow(null);
      setAllocationDraft({});
    } catch (err) {
      setAllocationError(err instanceof Error ? err.message : '個体別給与量を保存できませんでした。');
    } finally {
      setAllocationSaving(false);
    }
  }

  async function handleUseOneBag(status: BagInventoryStatus) {
    if (status.quantity < 1) return;
    if (!status.bagWeightKg || numberValue(status.bagWeightKg) <= 0) {
      setError('1袋の重量が未登録のため、簡単出庫できません。記録を修正して1袋の重量を登録してください。');
      return;
    }
    const ok = window.confirm(`${status.feedName}を1袋使用しますか？\n\n袋数：1袋\n重量：${numberValue(status.bagWeightKg).toLocaleString('ja-JP')}kg`);
    if (!ok) return;
    setQuickUsingKey(status.key); setError(''); setSuccess('');
    try {
      await createFeedInventory({ transactionDate: todayDateValue(), feedName: status.feedName, transactionType: '出庫', quantity: '1', unit: '袋', bagWeightKg: status.bagWeightKg, totalWeightKg: status.bagWeightKg, unitPrice: '', totalPrice: '', supplier: status.supplier, memo: '1袋使用（簡単出庫）' });
      setSuccess(`${status.feedName}を1袋使用として記録しました。`);
      await loadInventory();
    } catch (err) { setError(err instanceof Error ? err.message : '1袋使用を記録できませんでした。'); }
    finally { setQuickUsingKey(''); }
  }

  async function handleUseOneRoll(status: RollInventoryStatus) {
    if (status.quantity < 1) return;
    if (!window.confirm(`${status.feedName}を1ロール使用しますか？`)) return;
    setQuickUsingKey(status.key); setError(''); setSuccess('');
    try {
      await createFeedInventory({ transactionDate: todayDateValue(), feedName: status.feedName, transactionType: '出庫', quantity: '1', unit: 'ロール', bagWeightKg: '', totalWeightKg: '', unitPrice: '', totalPrice: '', supplier: status.supplier, memo: '1ロール使用（簡単出庫）' });
      setSuccess(`${status.feedName}を1ロール使用として記録しました。`);
      await loadInventory();
    } catch (err) { setError(err instanceof Error ? err.message : '1ロール使用を記録できませんでした。'); }
    finally { setQuickUsingKey(''); }
  }

  async function handleUseOneCount(status: CountInventoryStatus) {
    if (status.quantity < 1) return;
    if (!window.confirm(`${status.feedName}を1${status.unit}使用しますか？`)) return;
    setQuickUsingKey(status.key); setError(''); setSuccess('');
    try {
      await createFeedInventory({ transactionDate: todayDateValue(), feedName: status.feedName, transactionType: '出庫', quantity: '1', unit: status.unit, bagWeightKg: '', totalWeightKg: '', unitPrice: '', totalPrice: '', supplier: status.supplier, memo: `1${status.unit}使用（簡単出庫）` });
      setSuccess(`${status.feedName}を1${status.unit}使用として記録しました。`);
      await loadInventory();
    } catch (err) { setError(err instanceof Error ? err.message : `1${status.unit}使用を記録できませんでした。`); }
    finally { setQuickUsingKey(''); }
  }

  function clearFilters() { setKeyword(''); setTransactionTypeFilter(''); setUnitFilter(''); setStartDate(''); setEndDate(''); }
  const hasFilter = Boolean(keyword || transactionTypeFilter || unitFilter || startDate || endDate);
  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const text = [row.transactionDate, row.feedName, row.transactionType, row.quantity, row.unit, row.unitPrice, row.totalPrice, row.supplier, row.memo].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (transactionTypeFilter && row.transactionType !== transactionTypeFilter) return false;
      if (unitFilter && row.unit !== unitFilter) return false;
      if ((startDate || endDate) && !isDateInRange(row.transactionDate, startDate, endDate)) return false;
      return true;
    });
  }, [rows, keyword, transactionTypeFilter, unitFilter, startDate, endDate]);

  const kgInventoryStatuses = useMemo(() => kgInventoryByFeed(rows), [rows]);
  const bagInventoryStatuses = useMemo(() => bagInventoryByFeed(rows), [rows]);
  const rollInventoryStatuses = useMemo(() => rollInventoryByFeed(rows), [rows]);
  const countInventoryStatuses = useMemo(() => countInventoryByFeed(rows), [rows]);
  const inventoryStatusCount = kgInventoryStatuses.length + bagInventoryStatuses.length + rollInventoryStatuses.length + countInventoryStatuses.length;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>飼料在庫管理</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" onClick={() => setSearchOpen((v) => !v)}>{searchOpen ? '検索を閉じる' : hasFilter ? '検索・絞り込み中' : '検索・絞り込み'}</Button>
          <Button variant="outlined" onClick={() => downloadFeedInventoryCsv(filteredRows)} disabled={filteredRows.length === 0}>CSV出力</Button>
          <Button component={RouterLink} to="/feed-inventory/new" variant="contained">新規登録</Button>
        </Stack>
      </Stack>

      {searchOpen && (
        <Card><CardContent sx={{ py: 1.5 }}><Stack spacing={1}>
          <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
          <Grid container spacing={1}>
            <Grid item xs={12} md={6}><TextField label="キーワード検索" placeholder="日付、飼料名、区分、仕入先、メモなど" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" /></Grid>
            <Grid item xs={12} md={3}><TextField select label="区分" value={transactionTypeFilter} onChange={(e) => setTransactionTypeFilter(e.target.value)} fullWidth size="small"><MenuItem value="">すべて</MenuItem>{feedInventoryTransactionTypeOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={3}><TextField select label="単位" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} fullWidth size="small"><MenuItem value="">すべて</MenuItem>{feedInventoryUnitOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={3}><TextField label="開始日" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} md={3}><TextField label="終了日" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} md={6}><Stack direction="row" spacing={1} alignItems="center" sx={{ height: '100%' }}><Button variant="outlined" onClick={clearFilters} disabled={!hasFilter} size="small">条件クリア</Button>{hasFilter && <Typography color="text.secondary">条件あり：{filteredRows.length}件表示中</Typography>}</Stack></Grid>
          </Grid>
        </Stack></CardContent></Card>
      )}

      <Alert severity="info">飼料在庫の入庫・出庫・調整記録の一覧です。表示中のデータだけCSV出力できます。</Alert>
      {success && <Alert severity="success">{success}</Alert>}

      <Card><CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 1.5 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight={800}>在庫状況</Typography>
            <Typography variant="body2" color="text.secondary">飼料ごとの現在在庫</Typography>
          </Box>
          <Stack direction="row" spacing={3}>
            <Box><Typography color="text.secondary" variant="body2">飼料数</Typography><Typography fontWeight={800}>{inventoryStatusCount}種類</Typography></Box>
            <Box><Typography color="text.secondary" variant="body2">表示件数</Typography><Typography fontWeight={800}>{filteredRows.length}件{hasFilter ? `／全${rows.length}件` : ''}</Typography></Box>
          </Stack>
        </Stack>

        {inventoryStatusCount === 0 ? (
          <Typography color="text.secondary">在庫記録はありません。</Typography>
        ) : (
          <Grid container spacing={1}>
            {kgInventoryStatuses.map((status) => <Grid item xs={12} sm={6} md={4} key={status.key}><Card variant="outlined"><CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}><Stack spacing={0.75}><Stack direction="row"><Typography fontWeight={900} sx={{ flexGrow: 1 }}>{status.feedName}</Typography><Chip label="kg" size="small" variant="outlined" /></Stack><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Box sx={{ flexGrow: 1 }}><Typography fontWeight={900}>{status.quantity.toLocaleString('ja-JP')}kg</Typography><Typography color="text.secondary" variant="body2">現在在庫</Typography></Box></Stack></Stack></CardContent></Card></Grid>)}
            {bagInventoryStatuses.map((status) => <Grid item xs={12} sm={6} md={4} key={status.key}><Card variant="outlined"><CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}><Stack spacing={0.75}><Stack direction="row"><Typography fontWeight={900} sx={{ flexGrow: 1 }}>{status.feedName}</Typography><Chip label="袋" size="small" variant="outlined" /></Stack><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Box sx={{ flexGrow: 1 }}><Typography fontWeight={900}>{status.quantity.toLocaleString('ja-JP')}袋</Typography><Typography color="text.secondary" variant="body2">{status.bagWeightKg ? `現在在庫 約${status.totalWeightKg.toLocaleString('ja-JP')}kg` : '1袋重量未登録'}</Typography></Box><Button variant="outlined" size="small" onClick={() => handleUseOneBag(status)} disabled={status.quantity < 1 || !status.bagWeightKg || quickUsingKey === status.key}>{quickUsingKey === status.key ? '記録中' : '1袋使用'}</Button></Stack></Stack></CardContent></Card></Grid>)}
            {rollInventoryStatuses.map((status) => <Grid item xs={12} sm={6} md={4} key={status.key}><Card variant="outlined"><CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}><Stack spacing={0.75}><Stack direction="row"><Typography fontWeight={900} sx={{ flexGrow: 1 }}>{status.feedName}</Typography><Chip label="ロール" size="small" variant="outlined" /></Stack><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Box sx={{ flexGrow: 1 }}><Typography fontWeight={900}>{status.quantity.toLocaleString('ja-JP')}ロール</Typography><Typography color="text.secondary" variant="body2">現在在庫</Typography></Box><Button variant="outlined" size="small" onClick={() => handleUseOneRoll(status)} disabled={status.quantity < 1 || quickUsingKey === status.key}>{quickUsingKey === status.key ? '記録中' : '1ロール使用'}</Button></Stack></Stack></CardContent></Card></Grid>)}
            {countInventoryStatuses.map((status) => <Grid item xs={12} sm={6} md={4} key={status.key}><Card variant="outlined"><CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}><Stack spacing={0.75}><Stack direction="row"><Typography fontWeight={900} sx={{ flexGrow: 1 }}>{status.feedName}</Typography><Chip label={status.unit} size="small" variant="outlined" /></Stack><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Box sx={{ flexGrow: 1 }}><Typography fontWeight={900}>{status.quantity.toLocaleString('ja-JP')}{status.unit}</Typography><Typography color="text.secondary" variant="body2">現在在庫</Typography></Box><Button variant="outlined" size="small" onClick={() => handleUseOneCount(status)} disabled={status.quantity < 1 || quickUsingKey === status.key}>{quickUsingKey === status.key ? '記録中' : `1${status.unit}使用`}</Button></Stack></Stack></CardContent></Card></Grid>)}
          </Grid>
        )}
      </CardContent></Card>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && filteredRows.length === 0 && <Alert severity="success">条件に合う飼料在庫記録はありません。</Alert>}

      {!loading && !error && filteredRows.length > 0 && <>
        <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' } }}>
          {filteredRows.map((row) => <Card key={row.id} variant="outlined"><CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}><Stack spacing={1.25}>
            <Stack direction="row" spacing={1} alignItems="flex-start"><Box sx={{ flexGrow: 1 }}><Typography fontWeight={800}>{value(row.feedName)}</Typography><Typography variant="body2" color="text.secondary">{value(row.transactionDate)}</Typography></Box><Chip size="small" color={transactionColor(row.transactionType) as any} label={value(row.transactionType)} /><IconButton size="small" onClick={(event) => openMobileMenu(event.currentTarget, row)}><MoreVertIcon /></IconButton></Stack>
            <Grid container spacing={1}><Grid item xs={6}><Typography variant="caption" color="text.secondary">数量</Typography><Typography fontWeight={700}>{inventoryQuantity(row)}</Typography></Grid><Grid item xs={6}><Typography variant="caption" color="text.secondary">金額</Typography><Typography fontWeight={700}>{yen(row.totalPrice)}</Typography></Grid><Grid item xs={6}><Typography variant="caption" color="text.secondary">単価</Typography><Typography>{yen(row.unitPrice)}</Typography></Grid><Grid item xs={6}><Typography variant="caption" color="text.secondary">仕入先</Typography><Typography>{value(row.supplier)}</Typography></Grid></Grid>
            {row.memo && <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}><Typography variant="caption" color="text.secondary">メモ</Typography><Typography sx={{ whiteSpace: 'pre-wrap' }}>{row.memo}</Typography></Box>}
            {canUseFeedRow(row) && <Button component={RouterLink} to={feedUsePath(row)} variant="contained" fullWidth>使用する</Button>}
            {canManageIndividualQuantity(row) && <Button variant="outlined" fullWidth onClick={() => openAllocation(row)}>個体別給与量</Button>}
          </Stack></CardContent></Card>)}
        </Stack>

        <Menu anchorEl={mobileMenuAnchor} open={Boolean(mobileMenuAnchor)} onClose={closeMobileMenu}>
          {mobileMenuRow && canUseFeedRow(mobileMenuRow) && <MenuItem component={RouterLink} to={feedUsePath(mobileMenuRow)} onClick={closeMobileMenu}>使用する</MenuItem>}
          {mobileMenuRow && canManageIndividualQuantity(mobileMenuRow) && <MenuItem onClick={() => { const row = mobileMenuRow; closeMobileMenu(); if (row) openAllocation(row); }}>個体別給与量</MenuItem>}
          <MenuItem component={RouterLink} to={mobileMenuRow ? `/feed-inventory/${mobileMenuRow.id}/edit` : '/feed-inventory'} onClick={closeMobileMenu}>記録を修正</MenuItem>
          <MenuItem onClick={() => { const row = mobileMenuRow; closeMobileMenu(); if (row) void handleDelete(row); }} sx={{ color: 'error.main' }}>削除</MenuItem>
        </Menu>

        <Card sx={{ display: { xs: 'none', md: 'block' } }}><CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}><TableContainer><Table size="small"><TableHead><TableRow><TableCell sx={{ width: 120 }}>使用</TableCell><TableCell sx={{ width: 260 }}>操作</TableCell><TableCell>入出庫日</TableCell><TableCell>飼料名</TableCell><TableCell>区分</TableCell><TableCell>数量</TableCell><TableCell>単価</TableCell><TableCell>金額</TableCell><TableCell>仕入先</TableCell><TableCell>メモ</TableCell></TableRow></TableHead><TableBody>
          {filteredRows.map((row) => <TableRow key={row.id}><TableCell>{canUseFeedRow(row) ? <Button component={RouterLink} to={feedUsePath(row)} variant="contained" size="small">使用する</Button> : null}</TableCell><TableCell><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{canManageIndividualQuantity(row) && <Button variant="outlined" size="small" onClick={() => openAllocation(row)}>個体別給与量</Button>}<Button component={RouterLink} to={`/feed-inventory/${row.id}/edit`} variant="outlined" size="small">記録を修正</Button><Button variant="outlined" color="error" size="small" onClick={() => handleDelete(row)} disabled={deletingId === row.id}>{deletingId === row.id ? '削除中' : '削除'}</Button></Stack></TableCell><TableCell>{value(row.transactionDate)}</TableCell><TableCell>{value(row.feedName)}</TableCell><TableCell><Chip size="small" color={transactionColor(row.transactionType) as any} label={value(row.transactionType)} /></TableCell><TableCell>{inventoryQuantity(row)}</TableCell><TableCell>{yen(row.unitPrice)}</TableCell><TableCell>{yen(row.totalPrice)}</TableCell><TableCell>{value(row.supplier)}</TableCell><TableCell>{value(row.memo)}</TableCell></TableRow>)}
        </TableBody></Table></TableContainer></CardContent></Card>
      </>}

      <Dialog open={Boolean(allocationRow)} onClose={closeAllocation} fullWidth maxWidth="md">
        <DialogTitle>個体別給与量</DialogTitle>
        <DialogContent dividers>
          {allocationRow?.costing ? <Stack spacing={2}>
            <Alert severity="info">FarmProが日齢から自動計算します。日齢区分の比率や、各個体の給与量は必要に応じて修正できます。</Alert>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}><Typography variant="body2" color="text.secondary">飼料</Typography><Typography fontWeight={700}>{allocationRow.feedName}</Typography></Grid>
              <Grid item xs={12} sm={4}><Typography variant="body2" color="text.secondary">出庫数量</Typography><Typography fontWeight={700}>{formatAllocationNumber(allocationRow.costing.usedQuantity)}{allocationRow.costing.costUnit}</Typography></Grid>
              <Grid item xs={12} sm={4}><Typography variant="body2" color="text.secondary">個体合計</Typography><Typography fontWeight={800}>{formatAllocationNumber(allocationDraftTotal)}{allocationRow.costing.costUnit}</Typography></Grid>
            </Grid>

            {allocationRow.costing.targetType === 'calfGroup' && <Card variant="outlined"><CardContent>
              <Typography fontWeight={800} sx={{ mb: 1 }}>日齢別の按分比率</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>初期値は 1・2・3・4 です。数字を変えると個体の給与量を自動で再計算します。</Typography>
              <Grid container spacing={1}>
                <Grid item xs={6} sm={3}><TextField label="0〜30日齢" type="number" value={ageSettingsDraft.age0To30} onChange={(e) => updateAgeSetting('age0To30', e.target.value)} fullWidth size="small" inputProps={{ min: 0, step: 'any' }} /></Grid>
                <Grid item xs={6} sm={3}><TextField label="31〜60日齢" type="number" value={ageSettingsDraft.age31To60} onChange={(e) => updateAgeSetting('age31To60', e.target.value)} fullWidth size="small" inputProps={{ min: 0, step: 'any' }} /></Grid>
                <Grid item xs={6} sm={3}><TextField label="61〜90日齢" type="number" value={ageSettingsDraft.age61To90} onChange={(e) => updateAgeSetting('age61To90', e.target.value)} fullWidth size="small" inputProps={{ min: 0, step: 'any' }} /></Grid>
                <Grid item xs={6} sm={3}><TextField label="91日齢以上" type="number" value={ageSettingsDraft.age91Plus} onChange={(e) => updateAgeSetting('age91Plus', e.target.value)} fullWidth size="small" inputProps={{ min: 0, step: 'any' }} /></Grid>
              </Grid>
            </CardContent></Card>}

            {allocationError && <Alert severity="error">{allocationError}</Alert>}
            <Stack spacing={1}>
              <Typography fontWeight={800}>個体別給与量</Typography>
              {allocationRow.costing.allocations.map((item) => {
                const ageDays = inferredAgeDays(item);
                const raw = allocationDraft[item.animalId] ?? '';
                const quantity = Number(raw);
                const cost = Number.isFinite(quantity) ? quantity * allocationRow.costing!.averageUnitCost : 0;
                return <Box key={`${item.animalType}-${item.animalId}`} sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} sm={4}><Typography fontWeight={800}>{item.animalName || '名称未登録'}</Typography><Typography variant="body2" color="text.secondary">耳標 {item.earTag || '-'}{item.animalType === 'calf' ? ` ／ ${ageDays}日齢` : ''}</Typography></Grid>
                    <Grid item xs={7} sm={4}><TextField label="給与量" value={raw} onChange={(e) => { setAllocationDraft((current) => ({ ...current, [item.animalId]: e.target.value })); setAllocationError(''); }} type="number" size="small" fullWidth inputProps={{ min: 0, step: 'any' }} InputProps={{ endAdornment: <Typography color="text.secondary">{allocationRow.costing?.costUnit}</Typography> }} /></Grid>
                    <Grid item xs={5} sm={4}><Typography variant="body2" color="text.secondary">給与原価</Typography><Typography fontWeight={800}>{Math.round(cost).toLocaleString('ja-JP')}円</Typography></Grid>
                  </Grid>
                </Box>;
              })}
            </Stack>
          </Stack> : <Alert severity="info">個体別給与量を計算できる対象牛がいません。</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={closeAllocation} disabled={allocationSaving}>キャンセル</Button><Button variant="contained" onClick={() => void saveAllocation()} disabled={allocationSaving || !allocationRow?.costing}>{allocationSaving ? '保存中...' : '給与量を保存'}</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
