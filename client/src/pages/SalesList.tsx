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
import { getSalesList, SaleRecord } from '../services/salesApi';

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function yen(valueText: string) {
  const n = Number(valueText);
  if (Number.isNaN(n) || valueText === '') return '-';
  return `${n.toLocaleString('ja-JP')}円`;
}

function kg(valueText: string) {
  const n = Number(valueText);
  if (Number.isNaN(n) || valueText === '') return '-';
  return `${n.toLocaleString('ja-JP')}kg`;
}

function statusColor(status: string) {
  if (status === '販売済み') return 'success';
  if (status === '出荷済み') return 'info';
  if (status === '取消') return 'default';
  return 'warning';
}

export function SalesList() {
  const [rows, setRows] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    getSalesList()
      .then((data) => {
        setRows(data);
        setError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '出荷・販売記録を取得できませんでした。');
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      const text = [
        row.targetType,
        row.targetNumber,
        row.targetName,
        row.sex,
        row.motherName,
        row.shippingPlanDate,
        row.shippingDate,
        row.saleDate,
        row.buyer,
        row.marketName,
        row.saleWeight,
        row.salePrice,
        row.status,
        row.reason,
        row.memo
      ].join(' ').toLowerCase();

      return text.includes(q);
    });
  }, [rows, keyword]);

  const totalPrice = useMemo(() => {
    return filteredRows.reduce((sum, row) => {
      const n = Number(row.salePrice);
      return Number.isNaN(n) ? sum : sum + n;
    }, 0);
  }, [filteredRows]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          出荷・販売管理
        </Typography>
        <Button component={RouterLink} to="/sales/new" variant="contained">
          新規登録
        </Button>
      </Stack>

      <Alert severity="info">
        出荷・販売記録の一覧です。「新規登録」から販売記録を追加できます。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>集計</Typography>
            <Typography>表示件数：{filteredRows.length}件</Typography>
            <Typography>販売金額合計：{totalPrice.toLocaleString('ja-JP')}円</Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="検索"
              placeholder="番号、名前、販売先、市場名、状態など"
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
          出荷・販売記録はまだありません。「新規登録」から登録できます。
        </Alert>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <Card>
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>状態</TableCell>
                  <TableCell>区分</TableCell>
                  <TableCell>対象番号</TableCell>
                  <TableCell>対象名</TableCell>
                  <TableCell>出荷予定日</TableCell>
                  <TableCell>出荷日</TableCell>
                  <TableCell>販売日</TableCell>
                  <TableCell>販売先</TableCell>
                  <TableCell>市場名</TableCell>
                  <TableCell>販売体重</TableCell>
                  <TableCell>販売金額</TableCell>
                  <TableCell>メモ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Chip size="small" color={statusColor(row.status) as any} label={value(row.status)} />
                    </TableCell>
                    <TableCell>{value(row.targetType)}</TableCell>
                    <TableCell>{value(row.targetNumber)}</TableCell>
                    <TableCell>{value(row.targetName)}</TableCell>
                    <TableCell>{value(row.shippingPlanDate)}</TableCell>
                    <TableCell>{value(row.shippingDate)}</TableCell>
                    <TableCell>{value(row.saleDate)}</TableCell>
                    <TableCell>{value(row.buyer)}</TableCell>
                    <TableCell>{value(row.marketName)}</TableCell>
                    <TableCell>{kg(row.saleWeight)}</TableCell>
                    <TableCell>{yen(row.salePrice)}</TableCell>
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
