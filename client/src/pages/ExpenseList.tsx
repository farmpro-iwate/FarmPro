import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { getExpensesList, ExpenseRecord } from '../services/expensesApi';

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
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

export function ExpenseList() {
  const [rows, setRows] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');

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

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
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
  }, [rows, keyword]);

  const totalAmount = useMemo(() => {
    return filteredRows.reduce((sum, row) => {
      const n = Number(row.amount);
      return Number.isNaN(n) ? sum : sum + n;
    }, 0);
  }, [filteredRows]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          経費管理
        </Typography>
        <Button component={RouterLink} to="/expenses/new" variant="contained">
          新規登録
        </Button>
      </Stack>

      <Alert severity="info">
        経費記録の一覧です。「新規登録」から追加、「編集」から修正できます。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>集計</Typography>
            <Typography>表示件数：{filteredRows.length}件</Typography>
            <Typography>経費合計：{totalAmount.toLocaleString('ja-JP')}円</Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="検索"
              placeholder="日付、区分、内容、支払先、支払方法など"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              fullWidth
            />

            {keyword && (
              <Button variant="outlined" onClick={() => setKeyword('')}>
                検索をクリア
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {loading && <Typography>読み込み中...</Typography>}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && filteredRows.length === 0 && (
        <Alert severity="success">
          経費記録はまだありません。「新規登録」から登録できます。
        </Alert>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <Card>
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>操作</TableCell>
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
                    <TableCell>
                      <Button component={RouterLink} to={`/expenses/${row.id}/edit`} variant="outlined" size="small">
                        編集
                      </Button>
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
    </Stack>
  );
}
