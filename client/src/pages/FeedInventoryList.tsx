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

function canReviewAllocation(row: FeedInventoryRecord) {
  return row.transactionType === '出庫' && Boolean(row.costing?.allocations?.length);
}

function canRecordActualIntake(row: FeedInventoryRecord) {
  return row.transactionType === '出庫' && Boolean(row.costing?.allocations?.length);
}

function canManageIndividualCost(row: FeedInventoryRecord) {
  return canReviewAllocation(row) || canRecordActualIntake(row);
}

function targetLabel(targetType?: string) {
  if (targetType === 'farm') return '農場全体';
  if (targetType === 'calfGroup') return '子牛群';
  if (targetType === 'growingCattleGroup') return '育成牛群';
  if (targetType === 'breedingCattleGroup') return '繁殖牛群';
  if (targetType === 'individual') return '個体指定';
  return '-';
}

function allocationMethodLabel(method?: string) {
  if (method === 'none') return '按分なし';
  if (method === 'equal') return '均等按分';
  if (method === 'calfAgeWeighted') return '日齢按分';
  if (method === 'individual') return '個体指定';
  if (method === 'manual') return '手動修正';
  return '-';
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

function totalsByUnit(rows: FeedInventoryRecord[], transactionType: string) {
  return rows.filter((row) => row.transactionType === transactionType)
    .reduce<Record<string, number>>((totals, row) => {
      const unit = row.unit || '単位未設定';
      totals[unit] = (totals[unit] || 0) + numberValue(row.quantity);
      if (unit === '袋' && row.totalWeightKg) {
        totals.kg = (totals.kg || 0) + numberValue(row.totalWeightKg);
      }
      return totals;
    }, {});
}

function inventoryByUnit(rows: FeedInventoryRecord[]) {
  return rows.reduce<Record<string, number>>((totals, row) => {
    const unit = row.unit || '単位未設定';
    const quantity = numberValue(row.quantity);
    const signedQuantity = row.transactionType === '入庫'
      ? quantity
      : row.transactionType === '出庫'
        ? -quantity
        : row.transactionType === '調整'
          ? quantity
          : 0;

    totals[unit] = (totals[unit] || 0) + signedQuantity;
    if (unit === '袋' && row.totalWeightKg) {
      const signedWeight = row.transactionType === '入庫'
        ? numberValue(row.totalWeightKg)
        : row.transactionType === '出庫'
          ? -numberValue(row.totalWeightKg)
          : row.transactionType === '調整'
            ? numberValue(row.totalWeightKg)
            : 0;
      totals.kg = (totals.kg || 0) + signedWeight;
    }
    return totals;
  }, {});
}

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

function TotalsLine({ label, totals, emphasized = false }: { label: string; totals: Record<string, number>; emphasized?: boolean }) {
  const entries = Object.entries(totals);
  const totalsText = entries.length === 0 ? '記録なし' : entries.map(([unit, total]) => `${total.toLocaleString('ja-JP')}${unit}`).join(' ／ ');
  return (
    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ minWidth: 0 }}>
      <Typography color={emphasized ? 'primary.main' : 'text.secondary'} fontWeight={800} sx={{ width: { xs: 68, sm: 76 }, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography fontWeight={emphasized ? 900 : 700} sx={{ overflowWrap: 'anywhere' }}>{totalsText}</Typography>
    </Stack>
  );
}

function yen(valueText: string) {
  const n = Number(valueText);
  if (Number.isNaN(n) || valueText === '') return '-';
  return `${n.toLocaleString('ja-JP')}円`;
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

export function FeedInventoryList() {
  const [rows, setRows] = useState<FeedInventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [quickUsingKey, setQuickUsingKey] = useState('');
  const [mobileMenuAnchor, setMobileMenuAnchor] = useState<null | HTMLElement>(null);
  const [mobileMenuRow, setMobileMenuRow] = useState<FeedInventoryRecord | null>(null);
  const [costModeRow, setCostModeRow] = useState<FeedInventoryRecord | null>(null);
  const [allocationRow, setAllocationRow] = useState<FeedInventoryRecord | null>(null);
  const [actualIntakeRow, setActualIntakeRow] = useState<FeedInventoryRecord | null>(null);
  const [actualIntakeDraft, setActualIntakeDraft] = useState<Record<string, string>>({});
  const [actualIntakeSaving, setActualIntakeSaving] = useState(false);
  const [actualIntakeError, setActualIntakeError] = useState('');
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
  function openCostMode(row: FeedInventoryRecord) { setCostModeRow(row); }
  function closeCostMode() { setCostModeRow(null); }
  function openAllocation(row: FeedInventoryRecord) { setAllocationRow(row); }
  function closeAllocation() { setAllocationRow(null); }

  function chooseAllocation() {
    const row = costModeRow;
    setCostModeRow(null);
    if (row) openAllocation(row);
  }

  function chooseActualIntake() {
    const row = costModeRow;
    setCostModeRow(null);
    if (row) openActualIntake(row);
  }

  function openActualIntake(row: FeedInventoryRecord) {
    const existing = row.costing?.actualIntake;
    const existingByAnimal = new Map((existing?.items || []).map((item) => [item.animalId, item.actualQuantity]));
    setActualIntakeRow(row);
    setActualIntakeError('');
    setActualIntakeDraft(Object.fromEntries((row.costing?.allocations || []).map((item) => [item.animalId, existingByAnimal.has(item.animalId) ? String(existingByAnimal.get(item.animalId)) : ''])));
  }

  function closeActualIntake() {
    if (actualIntakeSaving) return;
    setActualIntakeRow(null);
    setActualIntakeDraft({});
    setActualIntakeError('');
  }

  async function saveActualIntake() {
    const row = actualIntakeRow;
    const costing = row?.costing;
    if (!row || !costing) return;
    const parsed = costing.allocations.map((item) => {
      const raw = (actualIntakeDraft[item.animalId] ?? '').trim();
      if (raw === '') return 0;
      const quantity = Number(raw);
      return Number.isFinite(quantity) && quantity >= 0 ? quantity : Number.NaN;
    });
    if (parsed.some((quantity) => Number.isNaN(quantity))) {
      setActualIntakeError('実給与量は0以上の数字で入力してください。');
      return;
    }
    const items = costing.allocations.map((item, index) => ({
      animalType: item.animalType,
      animalId: item.animalId,
      earTag: item.earTag,
      animalName: item.animalName,
      actualQuantity: parsed[index],
      actualCost: parsed[index] * costing.averageUnitCost,
    }));
    const totalQuantity = items.reduce((sum, item) => sum + item.actualQuantity, 0);
    const totalCost = items.reduce((sum, item) => sum + item.actualCost, 0);
    setActualIntakeSaving(true);
    setActualIntakeError('');
    try {
      const saved = await updateFeedInventoryCosting(row.id, {
        ...costing,
        actualIntake: { costUnit: costing.costUnit, averageUnitCost: costing.averageUnitCost, totalQuantity, totalCost, items, recordedAt: new Date().toISOString() },
      });
      setRows((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSuccess('実給与量を記録しました。');
      setActualIntakeRow(null);
      setActualIntakeDraft({});
    } catch (err) {
      setActualIntakeError(err instanceof Error ? err.message : '実給与量を保存できませんでした。');
    } finally {
      setActualIntakeSaving(false);
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

  const inboundTotals = useMemo(() => totalsByUnit(filteredRows, '入庫'), [filteredRows]);
  const outboundTotals = useMemo(() => totalsByUnit(filteredRows, '出庫'), [filteredRows]);
  const adjustmentTotals = useMemo(() => totalsByUnit(filteredRows, '調整'), [filteredRows]);
  const currentTotals = useMemo(() => inventoryByUnit(filteredRows), [filteredRows]);
  const bagInventoryStatuses = useMemo(() => bagInventoryByFeed(rows), [rows]);
  const rollInventoryStatuses = useMemo(() => rollInventoryByFeed(rows), [rows]);
  const countInventoryStatuses = useMemo(() => countInventoryByFeed(rows), [rows]);
  const totalPrice = useMemo(() => filteredRows.reduce((sum, row) => sum + numberValue(row.totalPrice), 0), [filteredRows]);
  const actualIntakeTotal = useMemo(() => {
    if (!actualIntakeRow?.costing) return 0;
    return actualIntakeRow.costing.allocations.reduce((sum, item) => {
      const raw = (actualIntakeDraft[item.animalId] ?? '').trim();
      if (raw === '') return sum;
      const n = Number(raw);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [actualIntakeRow, actualIntakeDraft]);

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
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1.5 }}>在庫状況</Typography>
        <Grid container spacing={{ xs: 1.5, lg: 2 }} alignItems="stretch">
          <Grid item xs={12} lg={4}><Stack spacing={0.75}><TotalsLine label="現在在庫" totals={currentTotals} emphasized /><TotalsLine label="入庫" totals={inboundTotals} /><TotalsLine label="出庫" totals={outboundTotals} /><TotalsLine label="調整" totals={adjustmentTotals} /></Stack></Grid>
          {(bagInventoryStatuses.length > 0 || rollInventoryStatuses.length > 0 || countInventoryStatuses.length > 0) && (
            <Grid item xs={12} lg={6}><Box sx={{ height: '100%', borderTop: { xs: 1, lg: 0 }, borderLeft: { lg: 1 }, borderColor: 'divider', pt: { xs: 1.5, lg: 0 }, pl: { lg: 2 } }}>
              <Typography fontWeight={800} variant="body2" sx={{ mb: 0.75 }}>飼料別在庫</Typography>
              <Grid container spacing={1}>
                {bagInventoryStatuses.map((status) => <Grid item xs={12} sm={6} key={status.key}><Card variant="outlined"><CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}><Stack spacing={0.75}><Stack direction="row"><Typography fontWeight={900} sx={{ flexGrow: 1 }}>{status.feedName}</Typography><Chip label="袋" size="small" variant="outlined" /></Stack><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Box sx={{ flexGrow: 1 }}><Typography fontWeight={800}>{status.quantity.toLocaleString('ja-JP')}袋</Typography><Typography color="text.secondary" variant="body2">{status.bagWeightKg ? `残り約 ${status.totalWeightKg.toLocaleString('ja-JP')}kg` : '1袋重量未登録'}</Typography></Box><Button variant="outlined" size="small" onClick={() => handleUseOneBag(status)} disabled={status.quantity < 1 || !status.bagWeightKg || quickUsingKey === status.key}>{quickUsingKey === status.key ? '記録中' : '1袋使用'}</Button></Stack></Stack></CardContent></Card></Grid>)}
                {rollInventoryStatuses.map((status) => <Grid item xs={12} sm={6} key={status.key}><Card variant="outlined"><CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}><Stack spacing={0.75}><Stack direction="row"><Typography fontWeight={900} sx={{ flexGrow: 1 }}>{status.feedName}</Typography><Chip label="ロール" size="small" variant="outlined" /></Stack><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Box sx={{ flexGrow: 1 }}><Typography fontWeight={800}>{status.quantity.toLocaleString('ja-JP')}ロール</Typography><Typography color="text.secondary" variant="body2">残りの目安</Typography></Box><Button variant="outlined" size="small" onClick={() => handleUseOneRoll(status)} disabled={status.quantity < 1 || quickUsingKey === status.key}>{quickUsingKey === status.key ? '記録中' : '1ロール使用'}</Button></Stack></Stack></CardContent></Card></Grid>)}
                {countInventoryStatuses.map((status) => <Grid item xs={12} sm={6} key={status.key}><Card variant="outlined"><CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}><Stack spacing={0.75}><Stack direction="row"><Typography fontWeight={900} sx={{ flexGrow: 1 }}>{status.feedName}</Typography><Chip label={status.unit} size="small" variant="outlined" /></Stack><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Box sx={{ flexGrow: 1 }}><Typography fontWeight={800}>{status.quantity.toLocaleString('ja-JP')}{status.unit}</Typography><Typography color="text.secondary" variant="body2">残りの目安</Typography></Box><Button variant="outlined" size="small" onClick={() => handleUseOneCount(status)} disabled={status.quantity < 1 || quickUsingKey === status.key}>{quickUsingKey === status.key ? '記録中' : `1${status.unit}使用`}</Button></Stack></Stack></CardContent></Card></Grid>)}
              </Grid>
            </Box></Grid>
          )}
          <Grid item xs={12} lg={2}><Stack direction={{ xs: 'row', md: 'column' }} spacing={{ xs: 2, md: 1 }} sx={{ height: '100%', borderTop: { xs: 1, lg: 0 }, borderLeft: { lg: 1 }, borderColor: 'divider', pt: { xs: 1.25, lg: 0 }, pl: { lg: 2 } }}><Box sx={{ flex: 1 }}><Typography color="text.secondary" variant="body2">表示件数</Typography><Typography fontWeight={800}>{filteredRows.length}件{hasFilter ? `／全${rows.length}件` : ''}</Typography></Box><Box sx={{ flex: 1 }}><Typography color="text.secondary" variant="body2">金額合計</Typography><Typography fontWeight={900}>{totalPrice.toLocaleString('ja-JP')}円</Typography></Box></Stack></Grid>
        </Grid>
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
            {canManageIndividualCost(row) && <Button variant="outlined" fullWidth onClick={() => openCostMode(row)}>個体ごとの給与量</Button>}
          </Stack></CardContent></Card>)}
        </Stack>

        <Menu anchorEl={mobileMenuAnchor} open={Boolean(mobileMenuAnchor)} onClose={closeMobileMenu}>
          {mobileMenuRow && canUseFeedRow(mobileMenuRow) && <MenuItem component={RouterLink} to={feedUsePath(mobileMenuRow)} onClick={closeMobileMenu}>使用する</MenuItem>}
          {mobileMenuRow && canManageIndividualCost(mobileMenuRow) && <MenuItem onClick={() => { const row = mobileMenuRow; closeMobileMenu(); if (row) openCostMode(row); }}>個体ごとの給与量</MenuItem>}
          <MenuItem component={RouterLink} to={mobileMenuRow ? `/feed-inventory/${mobileMenuRow.id}/edit` : '/feed-inventory'} onClick={closeMobileMenu}>記録を修正</MenuItem>
          <MenuItem onClick={() => { const row = mobileMenuRow; closeMobileMenu(); if (row) void handleDelete(row); }} sx={{ color: 'error.main' }}>削除</MenuItem>
        </Menu>

        <Card sx={{ display: { xs: 'none', md: 'block' } }}><CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}><TableContainer><Table size="small"><TableHead><TableRow><TableCell sx={{ width: 120 }}>使用</TableCell><TableCell sx={{ width: 260 }}>操作</TableCell><TableCell>入出庫日</TableCell><TableCell>飼料名</TableCell><TableCell>区分</TableCell><TableCell>数量</TableCell><TableCell>単価</TableCell><TableCell>金額</TableCell><TableCell>仕入先</TableCell><TableCell>メモ</TableCell></TableRow></TableHead><TableBody>
          {filteredRows.map((row) => <TableRow key={row.id}><TableCell>{canUseFeedRow(row) ? <Button component={RouterLink} to={feedUsePath(row)} variant="contained" size="small">使用する</Button> : null}</TableCell><TableCell><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{canManageIndividualCost(row) && <Button variant="outlined" size="small" onClick={() => openCostMode(row)}>個体ごとの給与量</Button>}<Button component={RouterLink} to={`/feed-inventory/${row.id}/edit`} variant="outlined" size="small">記録を修正</Button><Button variant="outlined" color="error" size="small" onClick={() => handleDelete(row)} disabled={deletingId === row.id}>{deletingId === row.id ? '削除中' : '削除'}</Button></Stack></TableCell><TableCell>{value(row.transactionDate)}</TableCell><TableCell>{value(row.feedName)}</TableCell><TableCell><Chip size="small" color={transactionColor(row.transactionType) as any} label={value(row.transactionType)} /></TableCell><TableCell>{inventoryQuantity(row)}</TableCell><TableCell>{yen(row.unitPrice)}</TableCell><TableCell>{yen(row.totalPrice)}</TableCell><TableCell>{value(row.supplier)}</TableCell><TableCell>{value(row.memo)}</TableCell></TableRow>)}
        </TableBody></Table></TableContainer></CardContent></Card>
      </>}

      <Dialog open={Boolean(costModeRow)} onClose={closeCostMode} fullWidth maxWidth="sm">
        <DialogTitle>個体ごとの給与量</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography fontWeight={700}>どちらの方法で個体ごとの給与量を管理しますか？</Typography>
            <Button variant="outlined" onClick={chooseAllocation} sx={{ justifyContent: 'flex-start', p: 2, textAlign: 'left' }}>
              <Box><Typography fontWeight={800}>自動按分で管理</Typography><Typography variant="body2" color="text.secondary">FarmProが日齢などから自動で個体へ配分します。</Typography></Box>
            </Button>
            <Button variant="outlined" onClick={chooseActualIntake} sx={{ justifyContent: 'flex-start', p: 2, textAlign: 'left' }}>
              <Box><Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight={800}>個体ごとの実給与量で管理</Typography>{costModeRow?.costing?.actualIntake && <Chip label="実給与量の記録あり" size="small" color="primary" variant="outlined" />}</Stack><Typography variant="body2" color="text.secondary">実際に量って与えた量を個体ごとに記録します。</Typography></Box>
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={closeCostMode}>キャンセル</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(allocationRow)} onClose={closeAllocation} fullWidth maxWidth="md">
        <DialogTitle>原価按分の確認</DialogTitle><DialogContent dividers>{allocationRow?.costing ? <Stack spacing={2}><Grid container spacing={1.5}><Grid item xs={12} sm={4}><Typography variant="body2" color="text.secondary">使用先</Typography><Typography fontWeight={700}>{targetLabel(allocationRow.costing.targetType)}</Typography></Grid><Grid item xs={12} sm={4}><Typography variant="body2" color="text.secondary">按分方法</Typography><Typography fontWeight={700}>{allocationMethodLabel(allocationRow.costing.allocationMethod)}</Typography></Grid><Grid item xs={12} sm={4}><Typography variant="body2" color="text.secondary">原価合計</Typography><Typography fontWeight={800}>{Math.round(allocationRow.costing.usedCost).toLocaleString('ja-JP')}円</Typography></Grid></Grid><Stack spacing={1}><Typography fontWeight={700}>個体別按分</Typography>{allocationRow.costing.allocations.map((item) => <Box key={`${item.animalType}-${item.animalId}`} sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 1.5 }}><Grid container spacing={1} alignItems="center"><Grid item xs={12} sm={5}><Typography fontWeight={800}>{item.animalName || '名称未登録'}</Typography><Typography variant="body2" color="text.secondary">耳標 {item.earTag || '-'}</Typography></Grid><Grid item xs={6} sm={3}><Typography variant="body2" color="text.secondary">按分数量</Typography><Typography>{formatAllocationNumber(item.allocatedQuantity)}{allocationRow.costing.costUnit}</Typography></Grid><Grid item xs={6} sm={4}><Typography variant="body2" color="text.secondary">按分金額</Typography><Typography fontWeight={800}>{Math.round(item.allocatedCost).toLocaleString('ja-JP')}円</Typography></Grid></Grid></Box>)}</Stack></Stack> : <Alert severity="info">按分情報はありません。</Alert>}</DialogContent><DialogActions><Button onClick={closeAllocation}>閉じる</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(actualIntakeRow)} onClose={closeActualIntake} fullWidth maxWidth="md">
        <DialogTitle>{actualIntakeRow?.costing?.actualIntake ? '実給与量を編集' : '実給与量を記録'}</DialogTitle>
        <DialogContent dividers>{actualIntakeRow?.costing ? <Stack spacing={2}><Alert severity="info">実際に量って与えた量を個体ごとに入力します。実給与量の合計は出庫数量と一致しなくても保存できます。</Alert><Grid container spacing={1.5}><Grid item xs={12} sm={4}><Typography variant="body2" color="text.secondary">飼料</Typography><Typography fontWeight={700}>{actualIntakeRow.feedName}</Typography></Grid><Grid item xs={12} sm={4}><Typography variant="body2" color="text.secondary">出庫数量</Typography><Typography fontWeight={700}>{formatAllocationNumber(actualIntakeRow.costing.usedQuantity)}{actualIntakeRow.costing.costUnit}</Typography></Grid><Grid item xs={12} sm={4}><Typography variant="body2" color="text.secondary">実給与量合計</Typography><Typography fontWeight={800}>{formatAllocationNumber(actualIntakeTotal)}{actualIntakeRow.costing.costUnit}</Typography></Grid></Grid>{actualIntakeTotal > actualIntakeRow.costing.usedQuantity && <Alert severity="warning">実給与量合計がこの出庫数量を上回っています。前回分の残りなどを含む場合は、そのまま保存できます。</Alert>}{actualIntakeError && <Alert severity="error">{actualIntakeError}</Alert>}<Stack spacing={1}><Typography fontWeight={700}>個体別実給与量</Typography>{actualIntakeRow.costing.allocations.map((item) => { const raw = (actualIntakeDraft[item.animalId] ?? '').trim(); const actualQuantity = raw === '' ? 0 : Number(raw); const previewCost = Number.isFinite(actualQuantity) ? actualQuantity * actualIntakeRow.costing!.averageUnitCost : 0; return <Box key={`${item.animalType}-${item.animalId}`} sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 1.5 }}><Grid container spacing={1} alignItems="center"><Grid item xs={12} sm={5}><Typography fontWeight={800}>{item.animalName || '名称未登録'}</Typography><Typography variant="body2" color="text.secondary">耳標 {item.earTag || '-'}</Typography></Grid><Grid item xs={7} sm={3}><TextField label="実給与量" value={actualIntakeDraft[item.animalId] ?? ''} onChange={(event) => { setActualIntakeDraft((current) => ({ ...current, [item.animalId]: event.target.value })); setActualIntakeError(''); }} type="number" size="small" fullWidth inputProps={{ min: 0, step: 'any' }} InputProps={{ endAdornment: <Typography color="text.secondary">{actualIntakeRow.costing?.costUnit}</Typography> }} /></Grid><Grid item xs={5} sm={4}><Typography variant="body2" color="text.secondary">給与原価</Typography><Typography fontWeight={800}>{Math.round(previewCost).toLocaleString('ja-JP')}円</Typography></Grid></Grid></Box>; })}</Stack></Stack> : <Alert severity="info">実給与量を記録できる対象個体がありません。</Alert>}</DialogContent>
        <DialogActions><Button onClick={closeActualIntake} disabled={actualIntakeSaving}>キャンセル</Button><Button variant="contained" onClick={() => void saveActualIntake()} disabled={actualIntakeSaving || !actualIntakeRow?.costing}>{actualIntakeSaving ? '保存中...' : '実給与量を保存'}</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
