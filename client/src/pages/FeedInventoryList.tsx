import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import {
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

function quantityLabel(unit: string) {
  if (unit === 'kg') return '重量';
  if (unit === '袋') return '袋数';
  return `${unit || '単位未設定'}数`;
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

function QuantityTotals({ label, totals }: { label: string; totals: Record<string, number> }) {
  const entries = Object.entries(totals);

  if (entries.length === 0) {
    return <Typography>{label}：記録なし</Typography>;
  }

  return (
    <Stack spacing={0.5}>
      {entries.map(([unit, total]) => (
        <Typography key={unit}>
          {label === '現在在庫'
            ? `現在在庫${quantityLabel(unit)}の目安`
            : `${label}${quantityLabel(unit)}合計`}
          ：{total.toLocaleString('ja-JP')} {unit}
        </Typography>
      ))}
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
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>集計</Typography>
            <Typography>全件数：{rows.length}件</Typography>
            <Typography>表示件数：{filteredRows.length}件</Typography>
            <QuantityTotals label="入庫" totals={inboundTotals} />
            <QuantityTotals label="出庫" totals={outboundTotals} />
            <QuantityTotals label="調整" totals={adjustmentTotals} />
            <QuantityTotals label="現在在庫" totals={currentTotals} />
            <Typography>金額合計：{totalPrice.toLocaleString('ja-JP')}円</Typography>
          </Stack>
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
        <Card>
          <CardContent>
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
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
