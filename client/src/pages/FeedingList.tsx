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
  deleteFeeding,
  FeedingRecord,
  feedingPurposeOptions,
  feedingUnitOptions,
  getFeedingsList
} from '../services/feedingsApi';

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

function yen(valueText: string) {
  const n = Number(valueText);
  if (Number.isNaN(n) || valueText === '') return '-';
  return `${n.toLocaleString('ja-JP')}円`;
}

function amountWithUnit(amount: string, unit: string) {
  if (!amount) return '-';
  const n = Number(amount);
  if (Number.isNaN(n)) return `${amount}${unit || ''}`;
  return `${n.toLocaleString('ja-JP')}${unit || ''}`;
}

function purposeColor(purpose: string) {
  if (purpose === '分娩前') return 'warning';
  if (purpose === '子牛育成') return 'info';
  if (purpose === '増体') return 'success';
  if (purpose === '繁殖') return 'secondary';
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

function printedAtText() {
  return new Date().toLocaleString('ja-JP');
}

function downloadFeedingsCsv(rows: FeedingRecord[]) {
  const headers = [
    '給与日',
    '対象',
    '飼料名',
    '給与量',
    '単位',
    '単価',
    '金額',
    '給与目的',
    'メモ',
    '作成日時',
    '更新日時'
  ];

  const body = rows.map((row) => [
    row.feedingDate,
    row.target,
    row.feedName,
    row.amount,
    row.unit,
    row.unitPrice,
    row.totalPrice,
    row.purpose,
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
  link.download = `farmpro_feedings_${todayText()}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export function FeedingList() {
  const [rows, setRows] = useState<FeedingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [keyword, setKeyword] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  async function loadFeedings() {
    setLoading(true);
    setError('');

    try {
      const data = await getFeedingsList();
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料給与記録を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeedings();
  }, []);

  async function handleDelete(row: FeedingRecord) {
    const ok = window.confirm(
      `この飼料給与記録を削除しますか？\n\n給与日：${row.feedingDate || '-'}\n対象：${row.target || '-'}\n飼料名：${row.feedName || '-'}`
    );

    if (!ok) return;

    setDeletingId(row.id);
    setError('');
    setSuccess('');

    try {
      await deleteFeeding(row.id);
      setSuccess('飼料給与記録を削除しました。');
      await loadFeedings();
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料給与記録を削除できませんでした。');
    } finally {
      setDeletingId('');
    }
  }

  function clearFilters() {
    setKeyword('');
    setPurposeFilter('');
    setUnitFilter('');
    setStartDate('');
    setEndDate('');
  }

  const hasFilter = Boolean(keyword || purposeFilter || unitFilter || startDate || endDate);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      if (q) {
        const text = [
          row.feedingDate,
          row.target,
          row.feedName,
          row.amount,
          row.unit,
          row.unitPrice,
          row.totalPrice,
          row.purpose,
          row.memo
        ].join(' ').toLowerCase();

        if (!text.includes(q)) return false;
      }

      if (purposeFilter && row.purpose !== purposeFilter) return false;
      if (unitFilter && row.unit !== unitFilter) return false;
      if ((startDate || endDate) && !isDateInRange(row.feedingDate, startDate, endDate)) return false;

      return true;
    });
  }, [rows, keyword, purposeFilter, unitFilter, startDate, endDate]);

  const totalAmount = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + numberValue(row.amount), 0);
  }, [filteredRows]);

  const totalPrice = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + numberValue(row.totalPrice), 0);
  }, [filteredRows]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" className="no-print">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          飼料給与管理
        </Typography>
        <Button variant="outlined" onClick={() => window.print()} disabled={filteredRows.length === 0}>
          印刷
        </Button>
        <Button variant="outlined" onClick={() => downloadFeedingsCsv(filteredRows)} disabled={filteredRows.length === 0}>
          CSV出力
        </Button>
        <Button component={RouterLink} to="/feedings/new" variant="contained">
          新規登録
        </Button>
      </Stack>

      <Stack spacing={0.5} className="print-only">
        <Typography variant="h5" fontWeight={800}>飼料給与台帳</Typography>
        <Typography>印刷日時：{printedAtText()}</Typography>
        <Typography>
          表示件数：{filteredRows.length}件 / 給与量合計：{totalAmount.toLocaleString('ja-JP')} / 金額合計：{totalPrice.toLocaleString('ja-JP')}円
        </Typography>
      </Stack>

      <Alert severity="info" className="no-print">
        飼料給与記録の一覧です。必要に応じて下部の検索・絞り込みを使えます。表示中のデータだけCSV出力・印刷できます。
      </Alert>

      {success && <Alert severity="success" className="no-print">{success}</Alert>}

      <Card className="no-print">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>集計</Typography>
            <Typography>全件数：{rows.length}件</Typography>
            <Typography>表示件数：{filteredRows.length}件</Typography>
            <Typography>表示中の給与量合計：{totalAmount.toLocaleString('ja-JP')}</Typography>
            <Typography>表示中の金額合計：{totalPrice.toLocaleString('ja-JP')}円</Typography>
          </Stack>
        </CardContent>
      </Card>

      {loading && <Typography>読み込み中...</Typography>}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && filteredRows.length === 0 && (
        <Alert severity="success">
          条件に合う飼料給与記録はありません。
        </Alert>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <Card className="print-card">
          <CardContent>
            <Table size="small" className="print-table">
              <TableHead>
                <TableRow>
                  <TableCell className="no-print">操作</TableCell>
                  <TableCell>給与日</TableCell>
                  <TableCell>対象</TableCell>
                  <TableCell>飼料名</TableCell>
                  <TableCell>給与量</TableCell>
                  <TableCell>単価</TableCell>
                  <TableCell>金額</TableCell>
                  <TableCell>給与目的</TableCell>
                  <TableCell>メモ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="no-print">
                      <Stack direction="row" spacing={1}>
                        <Button component={RouterLink} to={`/feedings/${row.id}/edit`} variant="outlined" size="small">
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
                    <TableCell>{value(row.feedingDate)}</TableCell>
                    <TableCell>{value(row.target)}</TableCell>
                    <TableCell>{value(row.feedName)}</TableCell>
                    <TableCell>{amountWithUnit(row.amount, row.unit)}</TableCell>
                    <TableCell>{yen(row.unitPrice)}</TableCell>
                    <TableCell>{yen(row.totalPrice)}</TableCell>
                    <TableCell>
                      <Chip size="small" color={purposeColor(row.purpose) as any} label={value(row.purpose)} />
                    </TableCell>
                    <TableCell>{value(row.memo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="no-print">
        <CardContent sx={{ py: 1.5 }}>
          <Stack spacing={1}>
            <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>

            <Grid container spacing={1}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="キーワード検索"
                  placeholder="日付、対象、飼料名、目的、メモなど"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  fullWidth
                  size="small"
                />
              </Grid>

              <Grid item xs={12} md={3}>
                <TextField
                  select
                  label="給与目的"
                  value={purposeFilter}
                  onChange={(e) => setPurposeFilter(e.target.value)}
                  fullWidth
                  size="small"
                >
                  <MenuItem value="">すべて</MenuItem>
                  {feedingPurposeOptions.map((item) => (
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
                  {feedingUnitOptions.map((item) => (
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
    </Stack>
  );
}
