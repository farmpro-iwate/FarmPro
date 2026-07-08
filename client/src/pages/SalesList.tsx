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
import { deleteSale, getSalesList, SaleRecord, SaleStatus, TargetType } from '../services/salesApi';

type StatusFilter = 'すべて' | SaleStatus;
type TargetTypeFilter = 'すべて' | TargetType;

const statusOptions: StatusFilter[] = ['すべて', '出荷予定', '出荷済み', '販売済み', '取消'];
const targetTypeOptions: TargetTypeFilter[] = ['すべて', '子牛', '成牛', 'その他'];

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

function downloadCsv(rows: SaleRecord[]) {
  const headers = [
    '状態',
    '区分',
    '対象番号',
    '対象名',
    '性別',
    '生年月日',
    '母牛',
    '出荷予定日',
    '出荷日',
    '販売日',
    '販売先・購買者',
    '市場名',
    '販売体重',
    '販売金額',
    '販売理由',
    'メモ',
    '作成日時',
    '更新日時'
  ];

  const body = rows.map((row) => [
    row.status,
    row.targetType,
    row.targetNumber,
    row.targetName,
    row.sex,
    row.birthday,
    row.motherName,
    row.shippingPlanDate,
    row.shippingDate,
    row.saleDate,
    row.buyer,
    row.marketName,
    row.saleWeight,
    row.salePrice,
    row.reason,
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
  link.download = `farmpro_sales_${todayText()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function printedAtText() {
  return new Date().toLocaleString('ja-JP');
}

export function SalesList() {
  const [rows, setRows] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('すべて');
  const [targetTypeFilter, setTargetTypeFilter] = useState<TargetTypeFilter>('すべて');

  async function loadSales() {
    setLoading(true);
    try {
      const data = await getSalesList();
      setRows(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '出荷・販売記録を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSales();
  }, []);

  async function handleDelete(row: SaleRecord) {
    const label = row.targetName || row.targetNumber || 'この記録';
    const ok = window.confirm(`${label} の出荷・販売記録を削除しますか？\n削除すると元に戻せません。`);

    if (!ok) return;

    setDeletingId(row.id);
    setError('');

    try {
      await deleteSale(row.id);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました。');
    } finally {
      setDeletingId('');
    }
  }

  function clearFilters() {
    setKeyword('');
    setStatusFilter('すべて');
    setTargetTypeFilter('すべて');
  }

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== 'すべて' && row.status !== statusFilter) return false;
      if (targetTypeFilter !== 'すべて' && row.targetType !== targetTypeFilter) return false;

      if (!q) return true;

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
  }, [rows, keyword, statusFilter, targetTypeFilter]);

  const totalPrice = useMemo(() => {
    return filteredRows.reduce((sum, row) => {
      const n = Number(row.salePrice);
      return Number.isNaN(n) ? sum : sum + n;
    }, 0);
  }, [filteredRows]);

  const statusCounts = useMemo(() => {
    return {
      all: rows.length,
      shippingPlan: rows.filter((row) => row.status === '出荷予定').length,
      shipped: rows.filter((row) => row.status === '出荷済み').length,
      sold: rows.filter((row) => row.status === '販売済み').length,
      canceled: rows.filter((row) => row.status === '取消').length
    };
  }, [rows]);

  const hasFilters = keyword || statusFilter !== 'すべて' || targetTypeFilter !== 'すべて';

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" className="no-print">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          出荷・販売管理
        </Typography>
        <Button variant="outlined" onClick={() => window.print()} disabled={filteredRows.length === 0}>
          印刷
        </Button>
        <Button variant="outlined" onClick={() => downloadCsv(filteredRows)} disabled={filteredRows.length === 0}>
          CSV出力
        </Button>
        <Button component={RouterLink} to="/sales/new" variant="contained">
          新規登録
        </Button>
      </Stack>

      <Stack spacing={0.5} className="print-only">
        <Typography variant="h5" fontWeight={800}>出荷・販売台帳</Typography>
        <Typography>印刷日時：{printedAtText()}</Typography>
        <Typography>表示件数：{filteredRows.length}件 / 販売金額合計：{totalPrice.toLocaleString('ja-JP')}円</Typography>
      </Stack>

      <Alert severity="info" className="no-print">
        出荷・販売記録の一覧です。検索、状態、区分で絞り込みできます。表示中の結果を印刷・CSV出力できます。
      </Alert>

      <Grid container spacing={2} className="no-print">
        <Grid item xs={6} sm={2.4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">全体</Typography>
              <Typography variant="h5" fontWeight={800}>{statusCounts.all}件</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">出荷予定</Typography>
              <Typography variant="h5" fontWeight={800}>{statusCounts.shippingPlan}件</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">出荷済み</Typography>
              <Typography variant="h5" fontWeight={800}>{statusCounts.shipped}件</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">販売済み</Typography>
              <Typography variant="h5" fontWeight={800}>{statusCounts.sold}件</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">取消</Typography>
              <Typography variant="h5" fontWeight={800}>{statusCounts.canceled}件</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card className="no-print">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>集計</Typography>
            <Typography>表示件数：{filteredRows.length}件</Typography>
            <Typography>販売金額合計：{totalPrice.toLocaleString('ja-JP')}円</Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardContent>
          <Stack spacing={2}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="検索"
                  placeholder="番号、名前、販売先、市場名、状態など"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select
                  label="状態"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  fullWidth
                >
                  {statusOptions.map((item) => (
                    <MenuItem key={item} value={item}>{item}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select
                  label="区分"
                  value={targetTypeFilter}
                  onChange={(e) => setTargetTypeFilter(e.target.value as TargetTypeFilter)}
                  fullWidth
                >
                  {targetTypeOptions.map((item) => (
                    <MenuItem key={item} value={item}>{item}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            {hasFilters && (
              <Button variant="outlined" onClick={clearFilters}>
                検索条件をクリア
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {loading && <Typography>読み込み中...</Typography>}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && filteredRows.length === 0 && (
        <Alert severity="success">
          条件に合う出荷・販売記録はありません。
        </Alert>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <Card className="print-card">
          <CardContent>
            <Table size="small" className="print-table">
              <TableHead>
                <TableRow>
                  <TableCell className="no-print">操作</TableCell>
                  <TableCell>状態</TableCell>
                  <TableCell>区分</TableCell>
                  <TableCell>対象番号</TableCell>
                  <TableCell>対象名</TableCell>
                  <TableCell className="print-table-only">出荷予定日</TableCell>
                  <TableCell>出荷日</TableCell>
                  <TableCell>販売日</TableCell>
                  <TableCell>販売先</TableCell>
                  <TableCell className="print-table-only">市場名</TableCell>
                  <TableCell className="print-table-only">販売体重</TableCell>
                  <TableCell>販売金額</TableCell>
                  <TableCell className="print-table-only">メモ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="no-print">
                      <Stack direction="row" spacing={1}>
                        <Button component={RouterLink} to={`/sales/${row.id}/edit`} variant="outlined" size="small">
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
                    <TableCell>
                      <Chip size="small" color={statusColor(row.status) as any} label={value(row.status)} />
                    </TableCell>
                    <TableCell>{value(row.targetType)}</TableCell>
                    <TableCell>{value(row.targetNumber)}</TableCell>
                    <TableCell>{value(row.targetName)}</TableCell>
                    <TableCell className="print-table-only">{value(row.shippingPlanDate)}</TableCell>
                    <TableCell>{value(row.shippingDate)}</TableCell>
                    <TableCell>{value(row.saleDate)}</TableCell>
                    <TableCell>{value(row.buyer)}</TableCell>
                    <TableCell className="print-table-only">{value(row.marketName)}</TableCell>
                    <TableCell className="print-table-only">{kg(row.saleWeight)}</TableCell>
                    <TableCell>{yen(row.salePrice)}</TableCell>
                    <TableCell className="print-table-only">{value(row.memo)}</TableCell>
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
