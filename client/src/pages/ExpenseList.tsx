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
  deleteExpense,
  getExpensesList,
  paymentMethodOptions,
  ExpenseRecord
} from '../services/expensesApi';

type CategoryFilter = 'すべて' | string;
type PaymentMethodFilter = 'すべて' | string;

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function rawValue(v: unknown) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function yen(valueText: string) {
  const n = Number(valueText);
  if (Number.isNaN(n) || valueText === '') return '-';
  return `${n.toLocaleString('ja-JP')}円`;
}

function categoryColor(category: string) {
  if (category === '飼料費') return 'success';
  if (category === '診療費' || category === '医薬品費') return 'error';
  if (category === '種付け・繁殖費') return 'info';
  if (category === '燃料費' || category === '水道光熱費') return 'warning';
  return 'default';
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

function downloadCsv(rows: ExpenseRecord[]) {
  const headers = [
    '支払日',
    '経費区分',
    '内容',
    '支払先',
    '金額',
    '支払方法',
    '対象',
    'メモ',
    '作成日時',
    '更新日時'
  ];

  const body = rows.map((row) => [
    row.paymentDate,
    row.category,
    row.description,
    row.vendor,
    row.amount,
    row.paymentMethod,
    row.target,
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
  link.download = `farmpro_expenses_${todayText()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExpenseList() {
  const [rows, setRows] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('すべて');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethodFilter>('すべて');

  async function loadExpenses() {
    setLoading(true);
    setError('');

    try {
      const data = await getExpensesList();
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '経費記録を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExpenses();
  }, []);

  async function handleDelete(row: ExpenseRecord) {
    const label = row.description || row.vendor || 'この経費記録';
    const ok = window.confirm(`${label} を削除しますか？\n削除すると元に戻せません。`);

    if (!ok) return;

    setDeletingId(row.id);
    setError('');

    try {
      await deleteExpense(row.id);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました。');
    } finally {
      setDeletingId('');
    }
  }

  function clearFilters() {
    setKeyword('');
    setCategoryFilter('すべて');
    setPaymentMethodFilter('すべて');
  }

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      if (categoryFilter !== 'すべて' && row.category !== categoryFilter) return false;
      if (paymentMethodFilter !== 'すべて' && row.paymentMethod !== paymentMethodFilter) return false;

      if (!q) return true;

      const text = [
        row.paymentDate,
        row.category,
        row.description,
        row.vendor,
        row.amount,
        row.paymentMethod,
        row.target,
        row.memo
      ].join(' ').toLowerCase();

      return text.includes(q);
    });
  }, [rows, keyword, categoryFilter, paymentMethodFilter]);

  const totalAmount = useMemo(() => {
    return filteredRows.reduce((sum, row) => {
      const n = Number(row.amount);
      return Number.isNaN(n) ? sum : sum + n;
    }, 0);
  }, [filteredRows]);

  const counts = useMemo(() => {
    return {
      all: rows.length,
      feed: rows.filter((row) => row.category === '飼料費').length,
      medical: rows.filter((row) => row.category === '診療費' || row.category === '医薬品費').length,
      breeding: rows.filter((row) => row.category === '種付け・繁殖費').length,
      other: rows.filter((row) => !['飼料費', '診療費', '医薬品費', '種付け・繁殖費'].includes(row.category)).length
    };
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const category = (row.category || '').trim();
      if (category) set.add(category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [rows]);

  const hasFilters = keyword || categoryFilter !== 'すべて' || paymentMethodFilter !== 'すべて';

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" className="no-print">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          経費管理
        </Typography>
        <Button variant="outlined" onClick={() => window.print()} disabled={filteredRows.length === 0}>
          印刷
        </Button>
        <Button variant="outlined" onClick={() => downloadCsv(filteredRows)} disabled={filteredRows.length === 0}>
          CSV出力
        </Button>
        <Button component={RouterLink} to="/expenses/new" variant="contained">
          新規登録
        </Button>
      </Stack>

      <Stack spacing={0.5} className="print-only">
        <Typography variant="h5" fontWeight={800}>経費台帳</Typography>
        <Typography>印刷日時：{printedAtText()}</Typography>
        <Typography>表示件数：{filteredRows.length}件 / 経費合計：{totalAmount.toLocaleString('ja-JP')}円</Typography>
      </Stack>

      <Alert severity="info" className="no-print">
        経費記録の一覧です。必要に応じて下部の検索・絞り込みを使えます。表示中の結果を印刷・CSV出力できます。
      </Alert>

      <Grid container spacing={2} className="no-print">
        <Grid item xs={6} sm={2.4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">全体</Typography>
              <Typography variant="h5" fontWeight={800}>{counts.all}件</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">飼料費</Typography>
              <Typography variant="h5" fontWeight={800}>{counts.feed}件</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">診療・医薬品</Typography>
              <Typography variant="h5" fontWeight={800}>{counts.medical}件</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">繁殖費</Typography>
              <Typography variant="h5" fontWeight={800}>{counts.breeding}件</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">その他</Typography>
              <Typography variant="h5" fontWeight={800}>{counts.other}件</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card className="no-print">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>集計</Typography>
            <Typography>表示件数：{filteredRows.length}件</Typography>
            <Typography>経費合計：{totalAmount.toLocaleString('ja-JP')}円</Typography>
          </Stack>
        </CardContent>
      </Card>

      {loading && <Typography>読み込み中...</Typography>}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && filteredRows.length === 0 && (
        <Alert severity="success">
          条件に合う経費記録はありません。
        </Alert>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <Card className="print-card">
          <CardContent>
            <Table size="small" className="print-table">
              <TableHead>
                <TableRow>
                  <TableCell className="no-print">操作</TableCell>
                  <TableCell>支払日</TableCell>
                  <TableCell>経費区分</TableCell>
                  <TableCell>内容</TableCell>
                  <TableCell>支払先</TableCell>
                  <TableCell>金額</TableCell>
                  <TableCell>支払方法</TableCell>
                  <TableCell>対象</TableCell>
                  <TableCell>メモ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="no-print">
                      <Stack direction="row" spacing={1}>
                        <Button component={RouterLink} to={`/expenses/${row.id}/edit`} variant="outlined" size="small">
                          編集
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          disabled={deletingId === row.id}
                          onClick={() => handleDelete(row)}
                        >
                          {deletingId === row.id ? '削除中' : '削除'}
                        </Button>
                      </Stack>
                    </TableCell>
                    <TableCell>{value(row.paymentDate)}</TableCell>
                    <TableCell>
                      <Chip size="small" color={categoryColor(row.category) as any} label={value(row.category)} />
                    </TableCell>
                    <TableCell>{value(row.description)}</TableCell>
                    <TableCell>{value(row.vendor)}</TableCell>
                    <TableCell>{yen(row.amount)}</TableCell>
                    <TableCell>{value(row.paymentMethod)}</TableCell>
                    <TableCell>{value(row.target)}</TableCell>
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
                  label="検索"
                  placeholder="日付、区分、内容、支払先、支払方法など"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  fullWidth
                  size="small"
                />
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select
                  label="経費区分"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  fullWidth
                  size="small"
                >
                  <MenuItem value="すべて">すべて</MenuItem>
                  {categoryOptions.map((item) => (
                    <MenuItem key={item} value={item}>{item}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select
                  label="支払方法"
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  fullWidth
                  size="small"
                >
                  <MenuItem value="すべて">すべて</MenuItem>
                  {paymentMethodOptions.map((item) => (
                    <MenuItem key={item} value={item}>{item}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            {hasFilters && (
              <Button variant="outlined" onClick={clearFilters} size="small">
                検索条件をクリア
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
