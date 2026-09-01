import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
  getFeedInventoryList
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
    const direction = row.transactionType === '入庫'
      ? 1
      : row.transactionType === '出庫'
        ? -1
        : row.transactionType === '調整'
          ? 1
          : 0;

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
    const current = groups.get(key) || {
      key,
      feedName: row.feedName || '名称未登録',
      quantity: 0,
      supplier: row.supplier || '',
    };
    const direction = row.transactionType === '入庫'
      ? 1
      : row.transactionType === '出庫'
        ? -1
        : row.transactionType === '調整'
          ? 1
          : 0;

    current.quantity += direction * numberValue(row.quantity);
    if (!current.supplier && row.supplier) current.supplier = row.supplier;
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((a, b) => a.feedName.localeCompare(b.feedName, 'ja'));
}

function TotalsLine({ label, totals, emphasized = false }: { label: string; totals: Record<string, number>; emphasized?: boolean }) {
  const entries = Object.entries(totals);
  const totalsText = entries.length === 0
    ? '記録なし'
    : entries.map(([unit, total]) => `${total.toLocaleString('ja-JP')}${unit}`).join(' ／ ');

  return (
    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ minWidth: 0 }}>
      <Typography
        color={emphasized ? 'primary.main' : 'text.secondary'}
        fontWeight={800}
        sx={{ width: { xs: 68, sm: 76 }, flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Typography fontWeight={emphasized ? 900 : 700} sx={{ overflowWrap: 'anywhere' }}>
        {totalsText}
      </Typography>
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

  const body = rows.map((row) => [
    row.transactionDate,
    row.feedName,
    row.transactionType,
    row.quantity,
    row.unit,
    row.bagWeightKg,
    row.totalWeightKg,
    row.unitPrice,
    row.totalPrice,
    row.supplier,
    row.memo,
    row.createdAt,
    row.updatedAt
  ]);

  const lines = [
    headers.map(csvEscape).join(','),
    ...body.map((line) => line.map((item) => csvEscape(rawValue(item))).join(','))
  ];

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

  useEffect(() => {
    loadInventory();
  }, []);

  async function handleDelete(row: FeedInventoryRecord) {
    const ok = window.confirm(
      `この飼料在庫記録を削除しますか？\n\n入出庫日：${row.transactionDate || '-'}\n飼料名：${row.feedName || '-'}\n区分：${row.transactionType || '-'}`
    );

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

  function openMobileMenu(anchor: HTMLElement, row: FeedInventoryRecord) {
    setMobileMenuAnchor(anchor);
    setMobileMenuRow(row);
  }

  function closeMobileMenu() {
    setMobileMenuAnchor(null);
    setMobileMenuRow(null);
  }

  async function handleUseOneBag(status: BagInventoryStatus) {
    if (status.quantity < 1) return;
    if (!status.bagWeightKg || numberValue(status.bagWeightKg) <= 0) {
      setError('1袋の重量が未登録のため、簡単出庫できません。編集画面で1袋の重量を登録してください。');
      return;
    }

    const ok = window.confirm(
      `${status.feedName}を1袋使用しますか？\n\n袋数：1袋\n重量：${numberValue(status.bagWeightKg).toLocaleString('ja-JP')}kg`
    );
    if (!ok) return;

    setQuickUsingKey(status.key);
    setError('');
    setSuccess('');
    try {
      await createFeedInventory({
        transactionDate: todayDateValue(),
        feedName: status.feedName,
        transactionType: '出庫',
        quantity: '1',
        unit: '袋',
        bagWeightKg: status.bagWeightKg,
        totalWeightKg: status.bagWeightKg,
        unitPrice: '',
        totalPrice: '',
        supplier: status.supplier,
        memo: '1袋使用（簡単出庫）',
      });
      setSuccess(`${status.feedName}を1袋使用として記録しました。`);
      await loadInventory();
    } catch (err) {
      setError(err instanceof Error ? err.message : '1袋使用を記録できませんでした。');
    } finally {
      setQuickUsingKey('');
    }
  }

  async function handleUseOneRoll(status: RollInventoryStatus) {
    if (status.quantity < 1) return;

    const ok = window.confirm(`${status.feedName}を1ロール使用しますか？`);
    if (!ok) return;

    setQuickUsingKey(status.key);
    setError('');
    setSuccess('');
    try {
      await createFeedInventory({
        transactionDate: todayDateValue(),
        feedName: status.feedName,
        transactionType: '出庫',
        quantity: '1',
        unit: 'ロール',
        bagWeightKg: '',
        totalWeightKg: '',
        unitPrice: '',
        totalPrice: '',
        supplier: status.supplier,
        memo: '1ロール使用（簡単出庫）',
      });
      setSuccess(`${status.feedName}を1ロール使用として記録しました。`);
      await loadInventory();
    } catch (err) {
      setError(err instanceof Error ? err.message : '1ロール使用を記録できませんでした。');
    } finally {
      setQuickUsingKey('');
    }
  }

  function clearFilters() {
    setKeyword('');
    setTransactionTypeFilter('');
    setUnitFilter('');
    setStartDate('');
    setEndDate('');
  }

  const hasFilter = Boolean(keyword || transactionTypeFilter || unitFilter || startDate || endDate);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      if (q) {
        const text = [
          row.transactionDate,
          row.feedName,
          row.transactionType,
          row.quantity,
          row.unit,
          row.unitPrice,
          row.totalPrice,
          row.supplier,
          row.memo
        ].join(' ').toLowerCase();

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

  const totalPrice = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + numberValue(row.totalPrice), 0);
  }, [filteredRows]);

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          飼料在庫管理
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" onClick={() => setSearchOpen((value) => !value)}>
            {searchOpen ? '検索を閉じる' : hasFilter ? '検索・絞り込み中' : '検索・絞り込み'}
          </Button>
          <Button variant="outlined" onClick={() => downloadFeedInventoryCsv(filteredRows)} disabled={filteredRows.length === 0}>
            CSV出力
          </Button>
          <Button component={RouterLink} to="/feed-inventory/new" variant="contained">
            新規登録
          </Button>
        </Stack>
      </Stack>

      {searchOpen && (
        <Card>
          <CardContent sx={{ py: 1.5 }}>
            <Stack spacing={1}>
              <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>

              <Grid container spacing={1}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="キーワード検索"
                    placeholder="日付、飼料名、区分、仕入先、メモなど"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    fullWidth
                    size="small"
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    select
                    label="区分"
                    value={transactionTypeFilter}
                    onChange={(e) => setTransactionTypeFilter(e.target.value)}
                    fullWidth
                    size="small"
                  >
                    <MenuItem value="">すべて</MenuItem>
                    {feedInventoryTransactionTypeOptions.map((item) => (
                      <MenuItem key={item} value={item}>{item}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    select
                    label="単位"
                    value={unitFilter}
                    onChange={(e) => setUnitFilter(e.target.value)}
                    fullWidth
                    size="small"
                  >
                    <MenuItem value="">すべて</MenuItem>
                    {feedInventoryUnitOptions.map((item) => (
                      <MenuItem key={item} value={item}>{item}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    label="開始日"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    label="終了日"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ height: '100%' }}>
                    <Button variant="outlined" onClick={clearFilters} disabled={!hasFilter} size="small">
                      条件クリア
                    </Button>
                    {hasFilter && (
                      <Typography color="text.secondary">
                        条件あり：{filteredRows.length}件表示中
                      </Typography>
                    )}
                  </Stack>
                </Grid>
              </Grid>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Alert severity="info">
        飼料在庫の入庫・出庫・調整記録の一覧です。表示中のデータだけCSV出力できます。
      </Alert>

      {success && <Alert severity="success">{success}</Alert>}

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={800} sx={{ mb: 1.5 }}>在庫状況</Typography>
          <Grid container spacing={{ xs: 1.5, md: 3 }} alignItems="stretch">
            <Grid item xs={12} md={8}>
              <Stack spacing={0.75}>
                <TotalsLine label="現在在庫" totals={currentTotals} emphasized />
                <TotalsLine label="入庫" totals={inboundTotals} />
                <TotalsLine label="出庫" totals={outboundTotals} />
                <TotalsLine label="調整" totals={adjustmentTotals} />
              </Stack>
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack
                direction={{ xs: 'row', md: 'column' }}
                spacing={{ xs: 2, md: 1 }}
                sx={{ height: '100%', borderTop: { xs: 1, md: 0 }, borderLeft: { md: 1 }, borderColor: 'divider', pt: { xs: 1.25, md: 0 }, pl: { md: 2.5 } }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography color="text.secondary" variant="body2">表示件数</Typography>
                  <Typography fontWeight={800}>{filteredRows.length}件{hasFilter ? `／全${rows.length}件` : ''}</Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography color="text.secondary" variant="body2">金額合計</Typography>
                  <Typography fontWeight={900}>{totalPrice.toLocaleString('ja-JP')}円</Typography>
                </Box>
              </Stack>
            </Grid>
          </Grid>

          {(bagInventoryStatuses.length > 0 || rollInventoryStatuses.length > 0) && (
            <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
              <Typography fontWeight={800} sx={{ mb: 1.25 }}>飼料別在庫</Typography>
              <Grid container spacing={1.25}>
                {bagInventoryStatuses.map((status) => (
                  <Grid item xs={12} sm={6} md={4} xl={3} key={status.key}>
                    <Card variant="outlined" sx={{ height: '100%', bgcolor: 'background.paper' }}>
                      <CardContent sx={{ p: { xs: 1.5, md: 1.25 }, height: '100%', '&:last-child': { pb: { xs: 1.5, md: 1.25 } } }}>
                        <Stack spacing={{ xs: 1.25, md: 0.75 }} sx={{ height: '100%' }}>
                          <Stack direction="row" spacing={1} alignItems="flex-start">
                            <Typography fontWeight={900} sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{status.feedName}</Typography>
                            <Chip label="袋" size="small" variant="outlined" sx={{ color: 'text.secondary', borderColor: 'divider' }} />
                          </Stack>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} sx={{ flexGrow: 1 }}>
                            <Box sx={{ flexGrow: 1 }}>
                              <Typography variant="h6" fontWeight={800} sx={{ fontSize: { md: '1.05rem' } }}>
                                {status.quantity.toLocaleString('ja-JP')}袋
                              </Typography>
                              <Typography color="text.secondary" variant="body2">
                                {status.bagWeightKg
                                  ? `残り約 ${status.totalWeightKg.toLocaleString('ja-JP')}kg`
                                  : '1袋重量未登録'}
                              </Typography>
                            </Box>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleUseOneBag(status)}
                              disabled={status.quantity < 1 || !status.bagWeightKg || quickUsingKey === status.key}
                              sx={{ width: { xs: '100%', md: 'auto' }, flexShrink: 0, whiteSpace: 'nowrap' }}
                            >
                              {quickUsingKey === status.key ? '記録中' : '1袋使用'}
                            </Button>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
                {rollInventoryStatuses.map((status) => (
                  <Grid item xs={12} sm={6} md={4} xl={3} key={status.key}>
                    <Card variant="outlined" sx={{ height: '100%', bgcolor: 'background.paper' }}>
                      <CardContent sx={{ p: { xs: 1.5, md: 1.25 }, height: '100%', '&:last-child': { pb: { xs: 1.5, md: 1.25 } } }}>
                        <Stack spacing={{ xs: 1.25, md: 0.75 }} sx={{ height: '100%' }}>
                          <Stack direction="row" spacing={1} alignItems="flex-start">
                            <Typography fontWeight={900} sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{status.feedName}</Typography>
                            <Chip label="ロール" size="small" variant="outlined" sx={{ color: 'text.secondary', borderColor: 'divider' }} />
                          </Stack>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} sx={{ flexGrow: 1 }}>
                            <Box sx={{ flexGrow: 1 }}>
                              <Typography variant="h6" fontWeight={800} sx={{ fontSize: { md: '1.05rem' } }}>
                                {status.quantity.toLocaleString('ja-JP')}ロール
                              </Typography>
                              <Typography color="text.secondary" variant="body2">残りの目安</Typography>
                            </Box>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleUseOneRoll(status)}
                              disabled={status.quantity < 1 || quickUsingKey === status.key}
                              sx={{ width: { xs: '100%', md: 'auto' }, flexShrink: 0, whiteSpace: 'nowrap' }}
                            >
                              {quickUsingKey === status.key ? '記録中' : '1ロール使用'}
                            </Button>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>

      {loading && <Typography>読み込み中...</Typography>}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && filteredRows.length === 0 && (
        <Alert severity="success">
          条件に合う飼料在庫記録はありません。
        </Alert>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <>
          <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' } }}>
            {filteredRows.map((row) => (
              <Card key={row.id} variant="outlined" sx={{ minWidth: 0 }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography fontWeight={800} sx={{ wordBreak: 'break-word' }}>{value(row.feedName)}</Typography>
                        <Typography variant="body2" color="text.secondary">{value(row.transactionDate)}</Typography>
                      </Box>
                      <Chip size="small" color={transactionColor(row.transactionType) as any} label={value(row.transactionType)} />
                      <IconButton
                        size="small"
                        aria-label={`${row.feedName || '飼料在庫'}の操作`}
                        onClick={(event) => openMobileMenu(event.currentTarget, row)}
                        disabled={deletingId === row.id}
                        sx={{ mt: -0.5, mr: -0.5 }}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </Stack>

                    <Grid container spacing={1}>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">数量</Typography>
                        <Typography fontWeight={700}>{inventoryQuantity(row)}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">金額</Typography>
                        <Typography fontWeight={700}>{yen(row.totalPrice)}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">単価</Typography>
                        <Typography>{yen(row.unitPrice)}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">仕入先</Typography>
                        <Typography sx={{ wordBreak: 'break-word' }}>{value(row.supplier)}</Typography>
                      </Grid>
                    </Grid>

                    {row.memo && (
                      <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider', minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary">メモ</Typography>
                        <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.memo}</Typography>
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Menu anchorEl={mobileMenuAnchor} open={Boolean(mobileMenuAnchor)} onClose={closeMobileMenu}>
            <MenuItem
              component={RouterLink}
              to={mobileMenuRow ? `/feed-inventory/${mobileMenuRow.id}/edit` : '/feed-inventory'}
              onClick={closeMobileMenu}
            >
              編集
            </MenuItem>
            <MenuItem
              onClick={() => {
                const row = mobileMenuRow;
                closeMobileMenu();
                if (row) void handleDelete(row);
              }}
              sx={{ color: 'error.main' }}
            >
              削除
            </MenuItem>
          </Menu>

          <Card sx={{ display: { xs: 'none', md: 'block' } }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <TableContainer>
                <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>操作</TableCell>
                  <TableCell>入出庫日</TableCell>
                  <TableCell>飼料名</TableCell>
                  <TableCell>区分</TableCell>
                  <TableCell>数量</TableCell>
                  <TableCell>単価</TableCell>
                  <TableCell>金額</TableCell>
                  <TableCell>仕入先</TableCell>
                  <TableCell>メモ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Button component={RouterLink} to={`/feed-inventory/${row.id}/edit`} variant="outlined" size="small">
                          編集
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleDelete(row)}
                          disabled={deletingId === row.id}
                        >
                          {deletingId === row.id ? '削除中' : '削除'}
                        </Button>
                      </Stack>
                    </TableCell>
                    <TableCell>{value(row.transactionDate)}</TableCell>
                    <TableCell>{value(row.feedName)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={transactionColor(row.transactionType) as any}
                        label={value(row.transactionType)}
                      />
                    </TableCell>
                    <TableCell>{inventoryQuantity(row)}</TableCell>
                    <TableCell>{yen(row.unitPrice)}</TableCell>
                    <TableCell>{yen(row.totalPrice)}</TableCell>
                    <TableCell>{value(row.supplier)}</TableCell>
                    <TableCell>{value(row.memo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}
