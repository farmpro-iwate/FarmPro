import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  getReportSummary,
  type ManagementAnalysisSummary,
} from '../services/reportApi';

function yen(value: number) {
  return `${Number(value || 0).toLocaleString('ja-JP')}円`;
}

function StatCard({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={0.5}>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={900}>{value}</Typography>
          {note && <Typography variant="body2" color="text.secondary">{note}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ReportPage() {
  const [summary, setSummary] = useState<ManagementAnalysisSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getReportSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : '経営分析を取得できませんでした。'))
      .finally(() => setLoading(false));
  }, []);

  const maxProfit = useMemo(() => {
    return Math.max(1, ...(summary?.monthly || []).map((row) => Math.abs(row.profitTotal)));
  }, [summary]);

  return (
    <Stack spacing={2}>
      <Stack spacing={0.4}>
        <Typography variant="h5" fontWeight={900}>経営分析</Typography>
        <Typography color="text.secondary">
          販売済みの記録をもとに、売上・生産費・利益を経営判断向けにまとめます。
        </Typography>
      </Stack>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && summary && (
        <>
          {summary.soldCount === 0 && (
            <Alert severity="info">
              今年の販売済み記録はまだありません。販売済み記録が入ると分析が表示されます。
            </Alert>
          )}

          <Typography variant="h6" fontWeight={800}>{summary.year}年の販売実績</Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6} md={3}><StatCard title="販売利益" value={yen(summary.profitTotal)} note={`${summary.soldCount}頭の合計`} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="1頭あたり平均利益" value={yen(summary.averageProfit)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="1頭あたり平均生産費" value={yen(summary.averageProductionCost)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="平均販売額" value={yen(summary.averageSaleAmount)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="売上合計" value={yen(summary.salesTotal)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="販売時生産費合計" value={yen(summary.productionCostTotal)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="販売頭数" value={`${summary.soldCount}頭`} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="利益率" value={`${summary.profitMargin}%`} note="販売利益 ÷ 売上" /></Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6" fontWeight={800}>月別の販売利益推移</Typography>
                {summary.monthly.length === 0 ? (
                  <Alert severity="info">月別に表示できる販売実績はまだありません。</Alert>
                ) : (
                  <Stack spacing={1}>
                    {summary.monthly.map((row) => {
                      const width = Math.max(4, Math.round((Math.abs(row.profitTotal) / maxProfit) * 100));
                      return (
                        <Stack key={row.yearMonth} spacing={0.4}>
                          <Stack direction="row" justifyContent="space-between" spacing={1}>
                            <Typography fontWeight={800}>{row.yearMonth}</Typography>
                            <Typography fontWeight={900}>{yen(row.profitTotal)}</Typography>
                          </Stack>
                          <Box sx={{ height: 18, borderRadius: 999, bgcolor: 'action.hover', overflow: 'hidden' }}>
                            <Box sx={{ width: `${width}%`, height: '100%', bgcolor: row.profitTotal >= 0 ? 'success.main' : 'error.main' }} />
                          </Box>
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>

          {summary.monthly.length > 0 && (
            <Card>
              <CardContent sx={{ p: 1.5 }}>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>年月</TableCell>
                        <TableCell>販売頭数</TableCell>
                        <TableCell>売上</TableCell>
                        <TableCell>販売時生産費</TableCell>
                        <TableCell>販売利益</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {summary.monthly.map((row) => (
                        <TableRow key={row.yearMonth}>
                          <TableCell sx={{ fontWeight: 800 }}>{row.yearMonth}</TableCell>
                          <TableCell>{row.soldCount}頭</TableCell>
                          <TableCell>{yen(row.salesTotal)}</TableCell>
                          <TableCell>{yen(row.productionCostTotal)}</TableCell>
                          <TableCell sx={{ fontWeight: 900 }}>{yen(row.profitTotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
}

export default ReportPage;
