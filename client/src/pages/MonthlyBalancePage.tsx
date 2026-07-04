import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import {
  getMonthlyBalance,
  MonthlyBalanceResponse,
  MonthlyBalanceRow
} from '../services/monthlyBalanceApi';

const emptyResponse: MonthlyBalanceResponse = {
  rows: [],
  totals: {
    salesTotalAmount: 0,
    expenseTotalAmount: 0,
    balanceAmount: 0,
    salesSoldCount: 0,
    expenseCount: 0,
    expenseFeedAmount: 0,
    expenseMedicalAmount: 0,
    expenseBreedingAmount: 0,
    expenseOtherAmount: 0
  }
};

function yen(value: number) {
  return `${Number(value || 0).toLocaleString('ja-JP')}円`;
}

function kg(value: number) {
  return `${Number(value || 0).toLocaleString('ja-JP')}kg`;
}

function rawValue(v: unknown) {
  if (v === null || v === undefined) return '';
  return String(v);
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

function balanceColor(value: number) {
  if (value > 0) return 'success';
  if (value < 0) return 'error';
  return 'default';
}

function SummaryCard({ title, value, note }: { title: string; value: string | number; note?: string }) {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Card>
        <CardContent>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={800}>{value}</Typography>
          {note && <Typography variant="body2" color="text.secondary">{note}</Typography>}
        </CardContent>
      </Card>
    </Grid>
  );
}

function rowAverageAmount(row: MonthlyBalanceRow) {
  if (!row.salesSoldCount) return 0;
  return Math.round(row.salesTotalAmount / row.salesSoldCount);
}

function downloadCsv(rows: MonthlyBalanceRow[]) {
  const headers = [
    '年月',
    '売上合計',
    '経費合計',
    '差引収支',
    '販売頭数',
    '平均販売金額',
    '平均販売体重',
    '経費件数',
    '飼料費',
    '診療・医薬品費',
    '繁殖費',
    'その他経費'
  ];

  const body = rows.map((row) => [
    row.yearMonth,
    row.salesTotalAmount,
    row.expenseTotalAmount,
    row.balanceAmount,
    row.salesSoldCount,
    row.salesAverageAmount || rowAverageAmount(row),
    row.salesAverageWeight,
    row.expenseCount,
    row.expenseFeedAmount,
    row.expenseMedicalAmount,
    row.expenseBreedingAmount,
    row.expenseOtherAmount
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
  link.download = `farmpro_monthly_balance_${todayText()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function MonthlyBalancePage() {
  const [data, setData] = useState<MonthlyBalanceResponse>(emptyResponse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const result = await getMonthlyBalance();
      setData({
        rows: result.rows || [],
        totals: { ...emptyResponse.totals, ...(result.totals || {}) }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '月別収支を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const averageSalesAmount = useMemo(() => {
    if (!data.totals.salesSoldCount) return 0;
    return Math.round(data.totals.salesTotalAmount / data.totals.salesSoldCount);
  }, [data]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" className="no-print">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          月別収支
        </Typography>
        <Button variant="outlined" onClick={() => window.print()} disabled={data.rows.length === 0}>
          印刷
        </Button>
        <Button variant="outlined" onClick={() => downloadCsv(data.rows)} disabled={data.rows.length === 0}>
          CSV出力
        </Button>
      </Stack>

      <Stack spacing={0.5} className="print-only">
        <Typography variant="h5" fontWeight={800}>月別収支表</Typography>
        <Typography>印刷日時：{printedAtText()}</Typography>
        <Typography>
          売上合計：{yen(data.totals.salesTotalAmount)} / 経費合計：{yen(data.totals.expenseTotalAmount)} / 差引収支：{yen(data.totals.balanceAmount)}
        </Typography>
      </Stack>

      <Alert severity="info" className="no-print">
        出荷・販売の売上と経費管理の支出を月別に集計します。正式な会計・税務申告には会計ソフトや税理士の確認が必要です。
      </Alert>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && (
        <>
          <Typography variant="h6" fontWeight={800} className="no-print">
            全体集計
          </Typography>

          <Grid container spacing={2} className="no-print">
            <SummaryCard title="売上合計" value={yen(data.totals.salesTotalAmount)} />
            <SummaryCard title="経費合計" value={yen(data.totals.expenseTotalAmount)} />
            <SummaryCard title="差引収支" value={yen(data.totals.balanceAmount)} />
            <SummaryCard title="販売頭数" value={`${data.totals.salesSoldCount}頭`} />
            <SummaryCard title="平均販売金額" value={yen(averageSalesAmount)} />
            <SummaryCard title="経費件数" value={`${data.totals.expenseCount}件`} />
            <SummaryCard title="飼料費" value={yen(data.totals.expenseFeedAmount)} />
            <SummaryCard title="診療・医薬品費" value={yen(data.totals.expenseMedicalAmount)} />
            <SummaryCard title="繁殖費" value={yen(data.totals.expenseBreedingAmount)} />
            <SummaryCard title="その他経費" value={yen(data.totals.expenseOtherAmount)} />
          </Grid>

          {data.rows.length === 0 && (
            <Alert severity="success">
              月別収支データはまだありません。販売済みの出荷・販売記録、または経費記録があると表示されます。
            </Alert>
          )}

          {data.rows.length > 0 && (
            <Card className="print-card">
              <CardContent>
                <Table size="small" className="print-table">
                  <TableHead>
                    <TableRow>
                      <TableCell>年月</TableCell>
                      <TableCell>差引収支</TableCell>
                      <TableCell>売上合計</TableCell>
                      <TableCell>経費合計</TableCell>
                      <TableCell>販売頭数</TableCell>
                      <TableCell>平均販売金額</TableCell>
                      <TableCell>平均販売体重</TableCell>
                      <TableCell>経費件数</TableCell>
                      <TableCell>飼料費</TableCell>
                      <TableCell>診療・医薬品費</TableCell>
                      <TableCell>繁殖費</TableCell>
                      <TableCell>その他経費</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow key={row.yearMonth}>
                        <TableCell>{row.yearMonth}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={balanceColor(row.balanceAmount) as any}
                            label={yen(row.balanceAmount)}
                          />
                        </TableCell>
                        <TableCell>{yen(row.salesTotalAmount)}</TableCell>
                        <TableCell>{yen(row.expenseTotalAmount)}</TableCell>
                        <TableCell>{row.salesSoldCount}頭</TableCell>
                        <TableCell>{yen(row.salesAverageAmount || rowAverageAmount(row))}</TableCell>
                        <TableCell>{kg(row.salesAverageWeight)}</TableCell>
                        <TableCell>{row.expenseCount}件</TableCell>
                        <TableCell>{yen(row.expenseFeedAmount)}</TableCell>
                        <TableCell>{yen(row.expenseMedicalAmount)}</TableCell>
                        <TableCell>{yen(row.expenseBreedingAmount)}</TableCell>
                        <TableCell>{yen(row.expenseOtherAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
}
